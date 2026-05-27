import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { detectHallucinations } from "@/lib/hallucination-detector";
import type {
  Citation,
  CitationVerificationResult,
  CitationVerificationSource,
  CitationVerificationStatus,
  CitationVerificationTestReport,
  IndianKanoonSearchDoc,
  IndianKanoonSearchResponse,
  VerificationCacheRecord,
  VerificationResult,
} from "@/lib/types";

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const IK_SEARCH_BASE = "https://api.indiankanoon.org/search/";
const IK_REQUEST_TIMEOUT_MS = 15_000;
const IK_MAX_RETRIES = 2;
/** Max concurrent IK requests — keeps batch runs within API rate limits. */
export const IK_MAX_CONCURRENT = 5;
/** Minimum gap between IK requests (ms); 0 disables artificial spacing. */
const IK_MIN_REQUEST_INTERVAL_MS = 0;
/** In-memory verification cache TTL (same process / pipeline window). */
export const MEMORY_CACHE_TTL_MS = 60_000;

const VERIFIED_CONFIDENCE = 0.95;
const UNVERIFIED_CONFIDENCE = 0.55;
const API_FAILURE_CONFIDENCE = 0.2;

/** BRAHMO assessment estimate — POST /search/ per citation. */
export const IK_SEARCH_COST_INR = 0.5;

// -----------------------------------------------------------------------------
// Environment validation
// -----------------------------------------------------------------------------

function getIndianKanoonApiKey(): string {
  const apiKey = process.env.INDIAN_KANOON_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "INDIAN_KANOON_API_KEY is required for Indian Kanoon verification"
    );
  }
  return apiKey;
}

function createVerificationSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeCitationKey(citationText: string): string {
  return citationText.trim().replace(/\s+/g, " ");
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

// -----------------------------------------------------------------------------
// Rate limiter (serializes IK traffic under batch load)
// -----------------------------------------------------------------------------

class RequestRateLimiter {
  private active = 0;
  private lastRequestAt = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly minIntervalMs: number
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      await this.enforceInterval();
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.waitQueue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }

  private async enforceInterval(): Promise<void> {
    if (this.minIntervalMs <= 0) {
      this.lastRequestAt = Date.now();
      return;
    }

    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }
}

// -----------------------------------------------------------------------------
// Batch verification context (pipeline dedup + metrics)
// -----------------------------------------------------------------------------

type BatchVerificationStats = {
  ikRequests: number;
  memoryCacheHits: number;
  supabaseCacheHits: number;
  pipelineDedupHits: number;
  preFilterRemoved: number;
};

type BatchVerificationContext = {
  pipelineCache: Map<string, Promise<CitationVerificationResult>>;
  stats: BatchVerificationStats;
};

function createBatchVerificationContext(): BatchVerificationContext {
  return {
    pipelineCache: new Map(),
    stats: {
      ikRequests: 0,
      memoryCacheHits: 0,
      supabaseCacheHits: 0,
      pipelineDedupHits: 0,
      preFilterRemoved: 0,
    },
  };
}

/** Deterministic unique keys in first-seen order. */
export function uniqueCitationKeysInOrder(citationTexts: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const citationText of citationTexts) {
    const key = normalizeCitationKey(citationText);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(key);
    }
  }

  return unique;
}

const ikRateLimiter = new RequestRateLimiter(
  IK_MAX_CONCURRENT,
  IK_MIN_REQUEST_INTERVAL_MS
);

// -----------------------------------------------------------------------------
// In-memory TTL cache (short-lived, process-local)
// -----------------------------------------------------------------------------

type MemoryCacheEntry = {
  result: CitationVerificationResult;
  expiresAt: number;
};

const memoryVerificationCache = new Map<string, MemoryCacheEntry>();

function getMemoryCacheResult(
  cacheKey: string
): CitationVerificationResult | null {
  const entry = memoryVerificationCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    memoryVerificationCache.delete(cacheKey);
    return null;
  }

  return {
    ...entry.result,
    metadata: {
      ...(entry.result.metadata ?? {}),
      fromCache: true,
      fromMemoryCache: true,
      ikApiCalled: false,
    },
  };
}

function setMemoryCacheResult(
  cacheKey: string,
  result: CitationVerificationResult
): void {
  if (result.metadata?.apiError === true) {
    return;
  }

  memoryVerificationCache.set(cacheKey, {
    result,
    expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
  });
}

/** Clears the process-local memory cache (tests only). */
export function clearMemoryVerificationCacheForTests(): void {
  memoryVerificationCache.clear();
}

function shouldSkipIndianKanoonForPersistentCache(
  status: CitationVerificationStatus | null | undefined
): boolean {
  return status === "VERIFIED" || status === "REMOVED";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -----------------------------------------------------------------------------
// HTTP helpers — timeout + retry
// -----------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchIndianKanoonWithRetry(
  url: string,
  init: RequestInit
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= IK_MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        url,
        init,
        IK_REQUEST_TIMEOUT_MS
      );

      if (response.ok || !isRetryableStatus(response.status)) {
        return response;
      }

      lastError = new Error(
        `Indian Kanoon API returned ${response.status} ${response.statusText}`
      );
    } catch (err) {
      lastError = err;
    }

    if (attempt < IK_MAX_RETRIES) {
      await sleep(250 * (attempt + 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Indian Kanoon API request failed after retries");
}

// -----------------------------------------------------------------------------
// Indian Kanoon response parsing
// -----------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIndianKanoonSearchResponse(
  payload: unknown
): IndianKanoonSearchResponse {
  if (!isRecord(payload)) {
    return {};
  }

  const docs = Array.isArray(payload.docs)
    ? payload.docs.filter(isRecord).map((doc) => doc as IndianKanoonSearchDoc)
    : undefined;

  return {
    found: typeof payload.found === "number" ? payload.found : undefined,
    docs,
    encodedformInput:
      typeof payload.encodedformInput === "string"
        ? payload.encodedformInput
        : undefined,
    formInput:
      typeof payload.formInput === "string" ? payload.formInput : undefined,
  };
}

function findMatchedCitation(
  citationText: string,
  doc: IndianKanoonSearchDoc
): string | undefined {
  const normalizedQuery = normalizeCitationKey(citationText).toLowerCase();
  const citeList = Array.isArray(doc.citeList)
    ? doc.citeList.filter((c): c is string => typeof c === "string")
    : [];

  for (const cite of citeList) {
    if (normalizeCitationKey(cite).toLowerCase().includes(normalizedQuery)) {
      return cite;
    }
  }

  if (doc.title && doc.title.toLowerCase().includes(normalizedQuery)) {
    return citationText;
  }

  return citeList[0];
}

function buildIkVerificationResult(
  citationText: string,
  response: IndianKanoonSearchResponse
): CitationVerificationResult {
  const verifiedAt = new Date().toISOString();
  const docs = response.docs ?? [];
  const hasResults =
    docs.length > 0 || (response.found !== undefined && response.found > 0);

  if (!hasResults) {
    const detection = detectHallucinations(citationText);
    const removeAsHallucinated =
      detection.isSuspicious ||
      Boolean(
        detection.extractedMetadata.reporter ||
          detection.extractedMetadata.year !== undefined
      );

    if (removeAsHallucinated) {
      return {
        citationText,
        status: "REMOVED",
        source: "INDIAN_KANOON",
        verifiedAt,
        confidence: Math.max(0.75, detection.confidence),
        metadata: {
          found: response.found ?? 0,
          source: "indiankanoon.org",
          ikNotFound: true,
          triggeredRules: detection.triggeredRules,
          removedReason: "not_found_in_indian_kanoon",
        },
      };
    }

    return {
      citationText,
      status: "UNVERIFIED",
      source: "INDIAN_KANOON",
      verifiedAt,
      confidence: UNVERIFIED_CONFIDENCE,
      metadata: {
        found: response.found ?? 0,
        source: "indiankanoon.org",
        ikApiCalled: true,
      },
    };
  }

  const topDoc = docs[0];
  const ikDocId = topDoc?.tid ? String(topDoc.tid) : undefined;
  const caseTitle =
    typeof topDoc?.title === "string" ? topDoc.title : undefined;
  const matchedCitation = topDoc
    ? findMatchedCitation(citationText, topDoc)
    : undefined;

  return {
    citationText,
    status: "VERIFIED",
    source: "INDIAN_KANOON",
    verifiedAt,
    confidence: VERIFIED_CONFIDENCE,
    caseTitle,
    ikDocId,
    matchedCitation,
    metadata: {
      found: response.found ?? docs.length,
      docsource: topDoc?.docsource,
      source: "indiankanoon.org",
      ikApiCalled: true,
    },
  };
}

function buildApiFailureResult(
  citationText: string,
  error: unknown
): CitationVerificationResult {
  const message = error instanceof Error ? error.message : String(error);

  return {
    citationText,
    status: "UNVERIFIED",
    source: "INDIAN_KANOON",
    verifiedAt: new Date().toISOString(),
    confidence: API_FAILURE_CONFIDENCE,
    metadata: {
      apiError: true,
      message,
      source: "indiankanoon.org",
    },
  };
}

function buildHallucinationRemovedResult(
  citationText: string,
  detection = detectHallucinations(citationText)
): CitationVerificationResult {
  return {
    citationText,
    status: "REMOVED",
    source: "HALLUCINATION_RULE",
    verifiedAt: new Date().toISOString(),
    confidence: detection.confidence,
    metadata: {
      triggeredRules: detection.triggeredRules,
      extractedMetadata: detection.extractedMetadata,
      isSuspicious: detection.isSuspicious,
    },
  };
}

function cacheRowToResult(row: VerificationCacheRecord): CitationVerificationResult {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const confidence =
    typeof metadata.confidence === "number"
      ? metadata.confidence
      : row.status === "VERIFIED"
        ? VERIFIED_CONFIDENCE
        : UNVERIFIED_CONFIDENCE;

  const matchedCitation =
    typeof metadata.matchedCitation === "string"
      ? metadata.matchedCitation
      : undefined;

  return {
    citationText: row.citation_text,
    status: (row.status ?? "UNVERIFIED") as CitationVerificationStatus,
    source: "CACHE",
    verifiedAt: row.verified_at ?? new Date().toISOString(),
    confidence,
    caseTitle: row.case_name ?? undefined,
    ikDocId: row.ik_doc_id ?? undefined,
    matchedCitation,
    metadata: { ...metadata, fromCache: true },
  };
}

// -----------------------------------------------------------------------------
// Cache helpers — cache-first architecture
// -----------------------------------------------------------------------------

/**
 * Looks up a prior verification in Supabase `verification_cache`.
 * Returns null on miss or when Supabase is unavailable (caller falls through to IK).
 */
export async function checkVerificationCache(
  citationText: string
): Promise<CitationVerificationResult | null> {
  const supabase = createVerificationSupabaseClient();
  if (!supabase) {
    return null;
  }

  const cacheKey = normalizeCitationKey(citationText);

  const { data, error } = await supabase
    .from("verification_cache")
    .select(
      "id, citation_text, status, verified_at, ik_doc_id, case_name, metadata"
    )
    .eq("citation_text", cacheKey)
    .maybeSingle();

  if (error || !data || !data.status) {
    return null;
  }

  return cacheRowToResult(data as VerificationCacheRecord);
}

/**
 * Persists a verification outcome so repeat lookups skip the IK API.
 * Failures are logged but do not block the caller.
 */
export async function storeVerificationCache(
  result: CitationVerificationResult
): Promise<void> {
  if (result.source === "HALLUCINATION_RULE") {
    return;
  }

  if (result.metadata?.apiError === true) {
    return;
  }

  const supabase = createVerificationSupabaseClient();
  if (!supabase) {
    return;
  }

  const metadata: Record<string, unknown> = {
    ...(result.metadata ?? {}),
    confidence: result.confidence,
    verificationSource: result.source,
  };

  if (result.matchedCitation) {
    metadata.matchedCitation = result.matchedCitation;
  }

  const row = {
    citation_text: normalizeCitationKey(result.citationText),
    status: result.status,
    verified_at: result.verifiedAt,
    ik_doc_id: result.ikDocId ?? null,
    case_name: result.caseTitle ?? null,
    metadata,
  };

  const { error } = await supabase
    .from("verification_cache")
    .upsert(row, { onConflict: "citation_text" });

  if (error) {
    console.error(
      `[citation-verifier] Failed to store verification cache: ${error.message}`
    );
  }
}

// -----------------------------------------------------------------------------
// Indian Kanoon API
// -----------------------------------------------------------------------------

/**
 * Queries Indian Kanoon `/search/` for a citation string.
 * Uses Token auth, timeout, and retry — deterministic string match only.
 */
export async function searchIndianKanoon(
  citationText: string
): Promise<CitationVerificationResult> {
  const normalized = normalizeCitationKey(citationText);

  let apiKey: string;
  try {
    apiKey = getIndianKanoonApiKey();
  } catch (err) {
    return buildApiFailureResult(normalized, err);
  }

  const params = new URLSearchParams({
    formInput: normalized,
    pagenum: "0",
    maxcites: "10",
  });
  const url = `${IK_SEARCH_BASE}?${params.toString()}`;

  console.log(`[citation-verifier] ik request citation="${normalized}"`);

  try {
    // IK search endpoint expects POST (GET returns 405 Method Not Allowed).
    const response = await ikRateLimiter.run(() =>
      fetchIndianKanoonWithRetry(url, {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          Accept: "application/json",
        },
      })
    );

    if (!response.ok) {
      throw new Error(
        `Indian Kanoon API error: ${response.status} ${response.statusText}`
      );
    }

    const payload: unknown = await response.json();
    const parsed = parseIndianKanoonSearchResponse(payload);
    return buildIkVerificationResult(normalized, parsed);
  } catch (err) {
    return buildApiFailureResult(normalized, err);
  }
}

// -----------------------------------------------------------------------------
// Public verification API
// -----------------------------------------------------------------------------

async function verifyCitationCore(
  normalized: string,
  ctx: BatchVerificationContext
): Promise<CitationVerificationResult> {
  // Hallucination bypass — impossible citations never hit cache or IK.
  const hallucination = detectHallucinations(normalized);
  if (hallucination.isHallucinated) {
    ctx.stats.preFilterRemoved += 1;
    const removed = buildHallucinationRemovedResult(normalized, hallucination);
    console.log(
      `[citation-verifier] pre-filter removed citation="${normalized}"`
    );
    return {
      ...removed,
      metadata: {
        ...removed.metadata,
        preFilterRemoved: true,
        ikApiCalled: false,
        fromCache: false,
      },
    };
  }

  const memoryCached = getMemoryCacheResult(normalized);
  if (memoryCached) {
    ctx.stats.memoryCacheHits += 1;
    console.log(
      `[citation-verifier] cache hit source=memory citation="${normalized}"`
    );
    return memoryCached;
  }

  const persistentCached = await checkVerificationCache(normalized);
  if (
    persistentCached &&
    shouldSkipIndianKanoonForPersistentCache(persistentCached.status)
  ) {
    ctx.stats.supabaseCacheHits += 1;
    console.log(
      `[citation-verifier] cache hit source=supabase status=${persistentCached.status} citation="${normalized}"`
    );
    setMemoryCacheResult(normalized, persistentCached);
    return persistentCached;
  }

  ctx.stats.ikRequests += 1;
  const ikResult = await searchIndianKanoon(normalized);
  await storeVerificationCache(ikResult);
  setMemoryCacheResult(normalized, ikResult);

  return ikResult;
}

async function verifyCitationWithContext(
  citationText: string,
  ctx: BatchVerificationContext
): Promise<CitationVerificationResult> {
  const normalized = normalizeCitationKey(citationText);
  const inFlight = ctx.pipelineCache.get(normalized);

  if (inFlight) {
    ctx.stats.pipelineDedupHits += 1;
    console.log(
      `[citation-verifier] pipeline dedup cache hit citation="${normalized}"`
    );
    return inFlight;
  }

  const promise = verifyCitationCore(normalized, ctx);
  ctx.pipelineCache.set(normalized, promise);
  return promise;
}

/**
 * Verifies a single citation: hallucination bypass → cache → Indian Kanoon.
 * Deterministic only — no LLM or heuristic guessing beyond rule engine flags.
 */
export async function verifyCitation(
  citationText: string
): Promise<CitationVerificationResult> {
  return verifyCitationWithContext(
    citationText,
    createBatchVerificationContext()
  );
}

/** Aggregates IK usage from per-citation verification rows. */
export function aggregateVerificationMetrics(
  results: CitationVerificationResult[]
): {
  preFilterRemovedCount: number;
  ikApiCalls: number;
  ikApiCostInr: number;
  cacheHits: number;
} {
  let preFilterRemovedCount = 0;
  let ikApiCalls = 0;
  let cacheHits = 0;

  for (const result of results) {
    const meta = result.metadata ?? {};
    if (meta.preFilterRemoved === true) {
      preFilterRemovedCount += 1;
    }
    if (meta.fromCache === true) {
      cacheHits += 1;
    }
    if (meta.ikApiCalled === true) {
      ikApiCalls += 1;
    }
  }

  return {
    preFilterRemovedCount,
    ikApiCalls,
    ikApiCostInr: Math.round(ikApiCalls * IK_SEARCH_COST_INR * 100) / 100,
    cacheHits,
  };
}

/**
 * Verifies many citations in parallel while preserving input order.
 * Unique citations run concurrently (max {@link IK_MAX_CONCURRENT} IK calls);
 * duplicates within the batch share one in-flight verification.
 */
export async function verifyCitationBatch(
  citations: string[]
): Promise<CitationVerificationResult[]> {
  const batchStartedAt = Date.now();
  const normalizedList = citations.map((c) => normalizeCitationKey(c));
  const uniqueKeys = uniqueCitationKeysInOrder(citations);
  const ctx = createBatchVerificationContext();

  console.log(
    `[citation-verifier] batch start total=${citations.length} unique=${uniqueKeys.length} maxConcurrent=${IK_MAX_CONCURRENT}`
  );

  const uniqueResults = await Promise.all(
    uniqueKeys.map((key) => verifyCitationWithContext(key, ctx))
  );

  const resultByKey = new Map(
    uniqueKeys.map((key, index) => [key, uniqueResults[index]])
  );
  const results = normalizedList.map((key) => {
    const result = resultByKey.get(key);
    if (!result) {
      throw new Error(`Missing verification result for citation key: ${key}`);
    }
    return result;
  });

  const cacheHits =
    ctx.stats.memoryCacheHits +
    ctx.stats.supabaseCacheHits +
    ctx.stats.pipelineDedupHits;
  const durationMs = Date.now() - batchStartedAt;

  console.log(
    `[citation-verifier] batch complete total=${citations.length} unique=${uniqueKeys.length} parallelBatchSize=${uniqueKeys.length} ikRequests=${ctx.stats.ikRequests} cacheHits=${cacheHits} memoryCacheHits=${ctx.stats.memoryCacheHits} supabaseCacheHits=${ctx.stats.supabaseCacheHits} pipelineDedupHits=${ctx.stats.pipelineDedupHits} preFilterRemoved=${ctx.stats.preFilterRemoved} durationMs=${durationMs}`
  );

  return results;
}

// -----------------------------------------------------------------------------
// Legacy placeholder (Citation[] pipeline — separate from string verifier)
// -----------------------------------------------------------------------------

/**
 * Verifies citations against authoritative legal sources.
 * @placeholder — wire to matter DB when full report pipeline is implemented
 */
export async function verifyCitations(
  citations: Citation[]
): Promise<VerificationResult[]> {
  void citations;
  return [];
}

// -----------------------------------------------------------------------------
// Smoke tests
// -----------------------------------------------------------------------------

/** Built-in examples for citation verification smoke tests. */
export const CITATION_VERIFICATION_SAMPLE_CITATIONS = {
  valid: "AIR 2004 SC 3358",
  hallucinated: "(2028) 3 SCC 45",
  fake: "AIR 1987 SC 99999",
} as const;

const VERIFICATION_SAMPLE_EXPECTATIONS: Record<
  string,
  {
    status: CitationVerificationStatus;
    source?: CitationVerificationSource;
  }
> = {
  [CITATION_VERIFICATION_SAMPLE_CITATIONS.valid]: {
    status: "VERIFIED",
  },
  [CITATION_VERIFICATION_SAMPLE_CITATIONS.hallucinated]: {
    status: "REMOVED",
    source: "HALLUCINATION_RULE",
  },
  [CITATION_VERIFICATION_SAMPLE_CITATIONS.fake]: {
    status: "UNVERIFIED",
  },
};

/**
 * Smoke-test helper: one valid, one hallucinated, and one fake citation.
 * Safe to call from scripts, API routes, or dev consoles.
 */
export async function testCitationVerification(): Promise<CitationVerificationTestReport> {
  const started = Date.now();
  const sampleCitations = [
    CITATION_VERIFICATION_SAMPLE_CITATIONS.valid,
    CITATION_VERIFICATION_SAMPLE_CITATIONS.hallucinated,
    CITATION_VERIFICATION_SAMPLE_CITATIONS.fake,
  ] as const;

  const results = await verifyCitationBatch([...sampleCitations]);

  let passed = 0;
  let failed = 0;

  const cases = sampleCitations.map((citationText, index) => {
    const result = results[index];
    const expected = VERIFICATION_SAMPLE_EXPECTATIONS[citationText];
    const statusOk = result.status === expected.status;
    const sourceOk =
      expected.source === undefined || result.source === expected.source;
    const ok = statusOk && sourceOk;

    if (ok) {
      passed += 1;
    } else {
      failed += 1;
    }

    return {
      citationText,
      result,
      expectedStatus: expected.status,
      expectedSource: expected.source,
    };
  });

  return {
    cases,
    passed,
    failed,
    durationMs: Date.now() - started,
  };
}
