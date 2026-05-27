import { NextResponse } from "next/server";
import { generateMockLlmResponse } from "@/lib/mock-llm";
import type { ApiResponse } from "@/lib/types";

/** LLM provider calls may need more than the default serverless limit. */
export const maxDuration = 60;

export interface LlmApiData {
  response: string;
  source: "mock" | "provider";
  query: string;
}

type LlmProvider = "openai" | "gemini";

const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const GEMINI_DEFAULT_MODEL = "gemini-1.5-flash";
/** Tried in order after LLM_MODEL when a Gemini call fails (HTTP error or empty response). */
const GEMINI_DEFAULT_FALLBACK_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-3.1-pro-preview",
] as const;
const DEFAULT_TIMEOUT_MS = 15_000;

function getEnvProvider(): LlmProvider {
  const raw = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (!raw) return "openai";
  if (raw === "openai" || raw === "gemini") return raw;
  throw new Error(
    `Invalid LLM_PROVIDER="${process.env.LLM_PROVIDER}". Supported values: openai, gemini.`
  );
}

function getEnvModel(provider: LlmProvider): string {
  const raw = process.env.LLM_MODEL?.trim();
  if (raw) return raw;
  return provider === "gemini" ? GEMINI_DEFAULT_MODEL : OPENAI_DEFAULT_MODEL;
}

function parseCommaSeparatedModels(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

/** Primary model first, then fallbacks; duplicates removed while preserving order. */
function getGeminiModelChain(primaryModel: string): string[] {
  const primary = primaryModel.trim() || GEMINI_DEFAULT_MODEL;
  const envFallbacks = parseCommaSeparatedModels(
    process.env.LLM_FALLBACK_MODELS
  );
  const fallbacks =
    envFallbacks.length > 0
      ? envFallbacks
      : [...GEMINI_DEFAULT_FALLBACK_MODELS];

  const chain: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [primary, ...fallbacks]) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    chain.push(candidate);
  }
  return chain;
}

function truncateForLog(value: string, maxLen = 4000): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}...(truncated)`;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * POST /api/llm
 * Returns raw LLM text. Uses provider when configured; otherwise deterministic mock.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const matterId =
    typeof body.matterId === "string" ? body.matterId.trim() : undefined;

  if (!query) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "query is required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.LLM_API_KEY?.trim();
  let response: string;
  let source: LlmApiData["source"] = "mock";

  let provider: LlmProvider = "openai";
  let model: string = OPENAI_DEFAULT_MODEL;
  try {
    provider = getEnvProvider();
    model = getEnvModel(provider);
  } catch (err) {
    console.error("[llm] env validation failed, falling back to mock", err);
    provider = "openai";
    model = OPENAI_DEFAULT_MODEL;
  }

  if (apiKey) {
    try {
      const providerResponse =
        provider === "openai"
          ? await fetchOpenAIResponse({ query, apiKey, model })
          : await fetchGeminiWithFallback({ query, apiKey, primaryModel: model });

      if (providerResponse) {
        response = providerResponse;
        source = "provider";
      } else {
        response = generateMockLlmResponse(query, matterId);
      }
    } catch (err) {
      console.error(
        "[llm] provider call failed, falling back to mock",
        JSON.stringify({
          provider,
          model,
          error:
            err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        })
      );
      response = generateMockLlmResponse(query, matterId);
    }
  } else {
    response = generateMockLlmResponse(query, matterId);
  }

  return NextResponse.json<ApiResponse<LlmApiData>>({
    success: true,
    data: { response, source, query },
  });
}

const SYSTEM_INSTRUCTION =
  "You are a legal research assistant for Indian law. Include realistic case citations (AIR, SCC) and statute sections. Be concise.";

async function fetchOpenAIResponse({
  query,
  apiKey,
  model,
}: {
  query: string;
  apiKey: string;
  model: string;
}): Promise<string | null> {
  const baseUrl =
    process.env.LLM_API_BASE_URL?.trim() ||
    "https://api.openai.com/v1/chat/completions";

  const res = await fetchWithTimeout(
    baseUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: query },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    },
    DEFAULT_TIMEOUT_MS
  );

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    console.error(
      "[llm/openai] request failed",
      JSON.stringify({
        status: res.status,
        provider: "openai",
        model,
        responseBody: truncateForLog(errorBody),
      })
    );
    return null;
  }

  const json: unknown = await res.json().catch(() => ({}));
  const content =
    (json as { choices?: Array<{ message?: { content?: unknown } }> })
      ?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;
  return content.trim() || null;
}

async function fetchGeminiWithFallback({
  query,
  apiKey,
  primaryModel,
}: {
  query: string;
  apiKey: string;
  primaryModel: string;
}): Promise<string | null> {
  const models = getGeminiModelChain(primaryModel);
  const primary = models[0];

  for (let i = 0; i < models.length; i++) {
    const currentModel = models[i];
    const result = await fetchGeminiResponse({
      query,
      apiKey,
      model: currentModel,
    });
    if (result) {
      if (i > 0) {
        console.warn(
          "[llm/gemini] primary model failed; succeeded with fallback",
          JSON.stringify({ primary, usedModel: currentModel, attempt: i + 1 })
        );
      }
      return result;
    }
  }

  console.error(
    "[llm/gemini] all models in chain failed",
    JSON.stringify({ models })
  );
  return null;
}

async function fetchGeminiResponse({
  query,
  apiKey,
  model,
}: {
  query: string;
  apiKey: string;
  model: string;
}): Promise<string | null> {
  const resolvedModel = model.trim() || GEMINI_DEFAULT_MODEL;
  console.log("[gemini] using model:", resolvedModel);

  // Endpoint:
  // https://generativelanguage.googleapis.com/v1/models/{model}:generateContent?key={API_KEY}
  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(
    resolvedModel
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = `${SYSTEM_INSTRUCTION}\n\nUser query:\n${query}`;

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    },
    DEFAULT_TIMEOUT_MS
  );

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    console.error(
      "[llm/gemini] request failed",
      JSON.stringify({
        status: res.status,
        provider: "gemini",
        model: resolvedModel,
        responseBody: truncateForLog(errorBody),
      })
    );
    return null;
  }

  const json: unknown = await res.json().catch(() => ({}));
  type GeminiResponse = {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: unknown }>;
      };
    }>;
  };
  const maybeText = (json as GeminiResponse)?.candidates?.[0]?.content?.parts?.[0]
    ?.text;
  if (typeof maybeText !== "string") return null;
  return maybeText.trim() || null;
}
