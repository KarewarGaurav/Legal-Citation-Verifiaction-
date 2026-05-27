import { includesVerifiedBadge } from "@/lib/citation-badges";
import { annotateCitations } from "@/lib/citation-annotator";
import { extractCitations } from "@/lib/citation-extractor";
import {
  aggregateVerificationMetrics,
  verifyCitationBatch,
} from "@/lib/citation-verifier";
import { getNormalizationMode, isNormalizationEnabled } from "@/lib/normalization-config";
import {
  mergeSectionNormalizations,
  normalizeSections,
} from "@/lib/section-normalizer";
import type {
  CitationAnnotation,
  CitationAnnotationSummary,
  CitationSafetyPipelineInput,
  CitationSafetyPipelineResult,
  CitationSafetyPipelineTestReport,
  CitationVerificationResult,
  ExtractedCitation,
  PipelineProcessingMetrics,
  SectionNormalizationResult,
} from "@/lib/types";

const EMPTY_ANNOTATION_SUMMARY: CitationAnnotationSummary = {
  total: 0,
  verified: 0,
  corrected: 0,
  unverified: 0,
  removed: 0,
  accuracyPercentage: 0,
};

export function generatePipelineMetrics(params: {
  extractionMs: number;
  verificationMs: number;
  annotationMs: number;
  citationCount: number;
  pipelineStartedAt: number;
  verificationResults: CitationVerificationResult[];
}): PipelineProcessingMetrics {
  const usage = aggregateVerificationMetrics(params.verificationResults);

  return {
    extractionMs: params.extractionMs,
    verificationMs: params.verificationMs,
    annotationMs: params.annotationMs,
    totalMs: performance.now() - params.pipelineStartedAt,
    citationCount: params.citationCount,
    preFilterRemovedCount: usage.preFilterRemovedCount,
    ikApiCalls: usage.ikApiCalls,
    ikApiCostInr: usage.ikApiCostInr,
    cacheHits: usage.cacheHits,
  };
}

function buildEmptySectionNormalization(query: string): SectionNormalizationResult {
  return {
    originalText: query,
    normalizedText: query,
    replacements: [],
    alerts: [],
  };
}

/**
 * Full Citation Safety Pipeline Orchestrator.
 *
 * 1. normalizeSections(query + llmResponse) — same NORMALIZATION_MODE for both
 * 2. extractCitations(normalizedResponse) so statute + reporter cites align
 * 3. verifyCitationBatch (parallel IK / cache / pre-filter)
 * 4. annotateCitations(normalizedResponse) — badge offsets match normalized text
 * 5. metrics + summary report
 */
export async function runCitationSafetyPipeline(
  params: CitationSafetyPipelineInput
): Promise<CitationSafetyPipelineResult> {
  const { query, llmResponse } = params;
  const pipelineStartedAt = performance.now();
  const normalizationMode = getNormalizationMode();

  const originalQuery = query;
  const originalResponse = llmResponse;

  let queryNormalization: SectionNormalizationResult;
  let responseNormalization: SectionNormalizationResult;
  try {
    [queryNormalization, responseNormalization] = await Promise.all([
      normalizeSections(query, { mode: normalizationMode }),
      normalizeSections(llmResponse, { mode: normalizationMode }),
    ]);
  } catch (err) {
    console.error("[citation-safety-pipeline] Section normalization failed:", err);
    queryNormalization = buildEmptySectionNormalization(query);
    responseNormalization = buildEmptySectionNormalization(llmResponse);
  }

  const sectionNormalization = mergeSectionNormalizations(
    queryNormalization,
    responseNormalization
  );
  const normalizedQuery = queryNormalization.normalizedText;
  const normalizedResponse = responseNormalization.normalizedText;

  // Extraction and annotation share normalizedResponse so IPC/BNS are not mixed.
  const textForCitationLayers = isNormalizationEnabled(normalizationMode)
    ? normalizedResponse
    : llmResponse;

  let extractedCitations: ExtractedCitation[] = [];
  const extractionStartedAt = performance.now();

  try {
    extractedCitations = await extractCitations(textForCitationLayers);
  } catch (err) {
    console.error("[citation-safety-pipeline] Citation extraction failed:", err);
    extractedCitations = [];
  }

  const extractionMs = performance.now() - extractionStartedAt;

  const citationTexts = extractedCitations.map((c) => c.citationText);
  const verificationStartedAt = performance.now();

  let verificationResults: CitationVerificationResult[] = [];
  try {
    verificationResults = await verifyCitationBatch(citationTexts);
  } catch (err) {
    console.error("[citation-safety-pipeline] Verification batch failed:", err);
    verificationResults = citationTexts.map((citationText) => ({
      citationText,
      status: "UNVERIFIED" as const,
      source: "INDIAN_KANOON" as const,
      verifiedAt: new Date().toISOString(),
      confidence: 0.2,
      metadata: { pipelineError: true, message: String(err) },
    }));
  }

  const verificationMs = performance.now() - verificationStartedAt;

  let annotatedResponse = textForCitationLayers;
  let annotations: CitationAnnotation[] = [];
  let annotationSummary: CitationAnnotationSummary = { ...EMPTY_ANNOTATION_SUMMARY };
  const annotationStartedAt = performance.now();

  try {
    const annotationResult = annotateCitations(
      textForCitationLayers,
      verificationResults
    );
    annotatedResponse = annotationResult.annotatedText;
    annotations = annotationResult.annotations;
    annotationSummary = annotationResult.summary;
  } catch (err) {
    console.error("[citation-safety-pipeline] Citation annotation failed:", err);
    annotatedResponse = textForCitationLayers;
    annotations = [];
    annotationSummary = { ...EMPTY_ANNOTATION_SUMMARY };
  }

  const annotationMs = performance.now() - annotationStartedAt;

  const processingMetrics = generatePipelineMetrics({
    extractionMs,
    verificationMs,
    annotationMs,
    citationCount: extractedCitations.length,
    pipelineStartedAt,
    verificationResults,
  });

  return {
    originalQuery,
    normalizedQuery,
    originalResponse,
    normalizedResponse,
    annotatedResponse,
    annotations,
    extractedCitations,
    verificationResults,
    sectionNormalization,
    annotationSummary,
    processingMetrics,
  };
}

export const CITATION_SAFETY_PIPELINE_SAMPLE_QUERY =
  "Complaint under Section 420 IPC and Section 406 IPC along with anticipatory bail under Section 438 CrPC.";

export const CITATION_SAFETY_PIPELINE_SAMPLE_RESPONSE =
  "The Hon'ble Court in AIR 2004 SC 3358 held that cheating under Section 420 IPC requires dishonest intention. " +
  "Reliance was also placed on (2028) 3 SCC 45, which is impossible. " +
  "A mis-typed reporter cite (2004)6 SCC224 appears in the draft.";

export async function testCitationSafetyPipeline(): Promise<CitationSafetyPipelineTestReport> {
  const started = Date.now();
  const input: CitationSafetyPipelineInput = {
    query: CITATION_SAFETY_PIPELINE_SAMPLE_QUERY,
    llmResponse: CITATION_SAFETY_PIPELINE_SAMPLE_RESPONSE,
  };

  const result = await runCitationSafetyPipeline(input);
  const checks: string[] = [];

  if (result.normalizedQuery.includes("BNS")) {
    checks.push("normalizedQuery contains BNS");
  } else {
    checks.push("normalizedQuery missing BNS (section_mappings may be empty)");
  }

  if (result.normalizedResponse.includes("BNS")) {
    checks.push("normalizedResponse contains BNS");
  } else {
    checks.push("normalizedResponse missing BNS");
  }

  if (result.sectionNormalization.replacements.length > 0) {
    checks.push(
      `sectionNormalization.replacements=${result.sectionNormalization.replacements.length}`
    );
  } else {
    checks.push("sectionNormalization.replacements=0");
  }

  if (result.extractedCitations.length >= 2) {
    checks.push(`extractedCitations=${result.extractedCitations.length}`);
  } else {
    checks.push(
      `extractedCitations=${result.extractedCitations.length} (expected >= 2)`
    );
  }

  const statuses = new Set(result.verificationResults.map((r) => r.status));
  if (statuses.has("VERIFIED")) checks.push("VERIFIED citation present");
  else checks.push("VERIFIED citation missing");
  if (statuses.has("REMOVED")) checks.push("REMOVED citation present");
  else checks.push("REMOVED citation missing");

  if (includesVerifiedBadge(result.annotatedResponse)) {
    checks.push("annotatedResponse contains VERIFIED badge");
  } else {
    checks.push("annotatedResponse missing VERIFIED badge");
  }

  if (
    result.processingMetrics.ikApiCalls >= 0 &&
    result.processingMetrics.preFilterRemovedCount >= 0
  ) {
    checks.push(
      `ikApiCalls=${result.processingMetrics.ikApiCalls} preFilter=${result.processingMetrics.preFilterRemovedCount}`
    );
  }

  const passed =
    result.normalizedQuery.includes("BNS") &&
    result.extractedCitations.length >= 2 &&
    statuses.has("REMOVED") &&
    includesVerifiedBadge(result.annotatedResponse);

  return {
    input,
    result,
    passed,
    durationMs: Date.now() - started,
    checks,
  };
}
