import { createServerSupabaseClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CitationAnnotation,
  CitationAnnotationSummary,
  CitationSafetyPipelineResult,
  PipelineProcessingMetrics,
  SectionNormalizationAlert,
  VerificationReport,
  VerificationResult,
} from "@/lib/types";

const TABLE = "citation_sessions";
const TITLE_MAX_LENGTH = 60;

/** Raw DB row — mirrors the column list in `supabase/schema.sql`. */
export interface CitationSessionRow {
  id: string;
  title: string;
  query: string;
  normalized_query: string | null;
  original_response: string | null;
  annotated_response: string | null;
  verification_summary: CitationAnnotationSummary | Record<string, never>;
  verification_results: VerificationResult[];
  extracted_citations: ExtractedCitationLike[];
  section_alerts: SectionNormalizationAlert[];
  processing_metrics: PipelineProcessingMetrics | Record<string, never>;
  verification_report: VerificationReport | Record<string, never> | null;
  created_at: string;
  updated_at: string;
}

interface ExtractedCitationLike {
  citationText: string;
  patternName?: string;
  startIndex: number;
  endIndex: number;
}

/** Persisted session as consumed by the dashboard UI. */
export interface CitationSessionRecord {
  id: string;
  title: string;
  query: string;
  normalizedQuery: string;
  originalResponse: string;
  annotatedResponse: string;
  verificationSummary: CitationAnnotationSummary | null;
  verificationResults: VerificationResult[];
  extractedCitations: ExtractedCitationLike[];
  sectionAlerts: SectionNormalizationAlert[];
  processingMetrics: PipelineProcessingMetrics | null;
  verificationReport: VerificationReport | null;
  createdAt: string;
  updatedAt: string;
}

/** Input payload for {@link saveCitationSession}. */
export interface SaveCitationSessionInput {
  query: string;
  title?: string;
  pipeline: CitationSafetyPipelineResult;
  report: VerificationReport;
  annotations?: CitationAnnotation[];
}

// ---------------------------------------------------------------------------
// Title generation
// ---------------------------------------------------------------------------

const TITLE_HEURISTICS: Array<{
  label: string;
  test: (q: string) => boolean;
}> = [
  {
    label: "Anticipatory Bail Research",
    test: (q) => q.includes("anticipatory bail") || q.includes("438"),
  },
  {
    label: "NDPS Bail Matter",
    test: (q) =>
      q.includes("ndps") ||
      (q.includes("bail") && q.includes("commercial quantity")),
  },
  {
    label: "Cheating Complaint Draft",
    test: (q) =>
      q.includes("cheating") ||
      q.includes("420 ipc") ||
      q.includes("section 420"),
  },
  {
    label: "Probate Dispute",
    test: (q) =>
      q.includes("probate") || q.includes("succession") || q.includes("will"),
  },
  {
    label: "Contract Fraud Analysis",
    test: (q) =>
      q.includes("contract") || q.includes("breach") || q.includes("damages"),
  },
  {
    label: "Bail Application",
    test: (q) => q.includes("bail"),
  },
  {
    label: "Criminal Complaint",
    test: (q) => q.includes("criminal") || q.includes("crpc") || q.includes("ipc"),
  },
];

/**
 * Generates a short, lawyer-friendly session title from the query.
 * Falls back to truncated query text when no heuristic matches.
 */
export function generateSessionTitle(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "Untitled Session";

  const lower = trimmed.toLowerCase();
  for (const heuristic of TITLE_HEURISTICS) {
    if (heuristic.test(lower)) return heuristic.label;
  }

  if (trimmed.length <= TITLE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function rowToRecord(row: CitationSessionRow): CitationSessionRecord {
  return {
    id: row.id,
    title: row.title,
    query: row.query,
    normalizedQuery: row.normalized_query ?? "",
    originalResponse: row.original_response ?? "",
    annotatedResponse: row.annotated_response ?? "",
    verificationSummary:
      row.verification_summary && "total" in row.verification_summary
        ? (row.verification_summary as CitationAnnotationSummary)
        : null,
    verificationResults: Array.isArray(row.verification_results)
      ? row.verification_results
      : [],
    extractedCitations: Array.isArray(row.extracted_citations)
      ? row.extracted_citations
      : [],
    sectionAlerts: Array.isArray(row.section_alerts) ? row.section_alerts : [],
    processingMetrics:
      row.processing_metrics && "totalMs" in row.processing_metrics
        ? (row.processing_metrics as PipelineProcessingMetrics)
        : null,
    verificationReport:
      row.verification_report && "id" in row.verification_report
        ? (row.verification_report as VerificationReport)
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolveClient(client?: SupabaseClient): SupabaseClient {
  if (client) return client;
  const created = createServerSupabaseClient();
  if (!created) {
    throw new Error(
      "Supabase client unavailable — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return created as SupabaseClient;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Inserts a new {@link CitationSessionRecord} from a completed pipeline run.
 * Title is auto-generated when not provided.
 */
export async function saveCitationSession(
  input: SaveCitationSessionInput,
  client?: SupabaseClient
): Promise<CitationSessionRecord> {
  const supabase = resolveClient(client);
  const { query, pipeline, report } = input;

  const title =
    input.title?.trim() && input.title.trim().length > 0
      ? input.title.trim()
      : generateSessionTitle(query);

  const payload = {
    title,
    query,
    normalized_query: pipeline.normalizedQuery,
    original_response: pipeline.originalResponse,
    annotated_response: pipeline.annotatedResponse,
    verification_summary: pipeline.annotationSummary,
    verification_results: report.results,
    extracted_citations: pipeline.extractedCitations.map((c) => ({
      citationText: c.citationText,
      patternName: c.patternName,
      startIndex: c.startIndex,
      endIndex: c.endIndex,
    })),
    section_alerts: pipeline.sectionNormalization.alerts,
    processing_metrics: pipeline.processingMetrics,
    verification_report: report,
  };

  let { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select("*")
    .single();

  if (
    error?.message?.includes("verification_report") ||
    error?.message?.includes("schema cache")
  ) {
    const { verification_report, ...legacyPayload } = payload;
    void verification_report;
    const retry = await supabase
      .from(TABLE)
      .insert(legacyPayload)
      .select("*")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    throw new Error(
      `Failed to save citation session: ${error?.message ?? "no data returned"}`
    );
  }

  const record = rowToRecord(data as CitationSessionRow);
  if (!record.verificationReport) {
    record.verificationReport = report;
  }
  return record;
}

/**
 * Returns the most recent sessions ordered by `created_at DESC`.
 * `limit` defaults to 50.
 */
export async function getRecentCitationSessions(
  limit = 50,
  client?: SupabaseClient
): Promise<CitationSessionRecord[]> {
  const supabase = resolveClient(client);

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load citation sessions: ${error.message}`);
  }

  return (data ?? []).map((row) => rowToRecord(row as CitationSessionRow));
}

/** Fetches a single session by id. Returns `null` when not found. */
export async function getCitationSessionById(
  id: string,
  client?: SupabaseClient
): Promise<CitationSessionRecord | null> {
  if (!id) return null;
  const supabase = resolveClient(client);

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load citation session: ${error.message}`);
  }

  return data ? rowToRecord(data as CitationSessionRow) : null;
}

/** Deletes a session by id. No-op if the row is already gone. */
export async function deleteCitationSession(
  id: string,
  client?: SupabaseClient
): Promise<void> {
  if (!id) return;
  const supabase = resolveClient(client);

  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) {
    throw new Error(`Failed to delete citation session: ${error.message}`);
  }
}
