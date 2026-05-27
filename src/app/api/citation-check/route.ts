import { NextResponse } from "next/server";
import { buildVerificationReport } from "@/lib/dashboard-mappers";
import { generateMockLlmResponse } from "@/lib/mock-llm";
import { runCitationSafetyPipeline } from "@/lib/citation-safety-pipeline";
import { saveCitationSession } from "@/lib/session-store";
import type { CitationSessionRecord } from "@/lib/session-store";
import type {
  ApiResponse,
  CitationAnnotation,
  CitationSafetyPipelineResult,
  VerificationReport,
} from "@/lib/types";

export interface CitationCheckApiData {
  pipeline: CitationSafetyPipelineResult;
  report: VerificationReport;
  genericResponse: string;
  annotations: CitationAnnotation[];
  llmSource: "mock" | "provided" | "provider";
  session: CitationSessionRecord | null;
  sessionError: string | null;
}

/**
 * POST /api/citation-check
 * Runs runCitationSafetyPipeline() on query + LLM response.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const matterId =
    typeof body.matterId === "string" ? body.matterId : "demo-matter";
  let llmResponse =
    typeof body.llmResponse === "string" ? body.llmResponse.trim() : "";

  if (!query) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "query is required" },
      { status: 400 }
    );
  }

  let llmSource: CitationCheckApiData["llmSource"] = "provided";

  if (!llmResponse) {
    llmResponse = generateMockLlmResponse(query);
    llmSource = "mock";
  }

  try {
    const pipeline = await runCitationSafetyPipeline({
      query,
      llmResponse,
    });

    const report = buildVerificationReport(matterId, query, pipeline);
    const annotations = pipeline.annotations;

    let session: CitationSessionRecord | null = null;
    let sessionError: string | null = null;
    try {
      session = await saveCitationSession({ query, pipeline, report });
    } catch (err) {
      sessionError =
        err instanceof Error ? err.message : "Failed to persist session";
      console.error("[citation-check] saveCitationSession failed:", err);
    }

    return NextResponse.json<ApiResponse<CitationCheckApiData>>({
      success: true,
      data: {
        pipeline,
        report,
        genericResponse: pipeline.originalResponse,
        annotations,
        llmSource,
        session,
        sessionError,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline failed";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
