import type { CitationSessionRecord } from "@/lib/session-store";
import type {
  Citation,
  CitationAnnotationSummary,
  CitationSafetyPipelineResult,
  CitationVerificationResult,
  CitationVerificationStatus,
  SectionMapping,
  SectionNormalizationAlert,
  VerificationReport,
  VerificationResult,
  VerificationStatus,
} from "@/lib/types";

function mapVerificationStatus(
  status: CitationVerificationStatus
): VerificationStatus {
  switch (status) {
    case "VERIFIED":
      return "verified";
    case "CORRECTED":
      return "partial";
    case "REMOVED":
      return "hallucinated";
    case "UNVERIFIED":
    default:
      return "unverified";
  }
}

/** Maps pipeline verification rows to dashboard {@link VerificationResult} alerts. */
export function mapToVerificationResults(
  results: CitationVerificationResult[]
): VerificationResult[] {
  return results.map((r, index) => ({
    citationId: `citation-${index}-${r.citationText.slice(0, 24)}`,
    citationText: r.citationText,
    status: mapVerificationStatus(r.status),
    confidence: r.confidence,
    source: r.source,
    sourceUrl: r.ikDocId
      ? `https://indiankanoon.org/doc/${r.ikDocId}/`
      : undefined,
    sourceTitle: r.caseTitle,
    notes:
      r.status === "REMOVED"
        ? "Citation removed — hallucinated or impossible"
        : r.status === "CORRECTED"
          ? r.matchedCitation
            ? `Corrected to: ${r.matchedCitation}`
            : "Formatting normalized"
          : r.status === "UNVERIFIED"
            ? "Not found in Indian Kanoon"
            : undefined,
    checkedAt: r.verifiedAt,
  }));
}

/** Builds a lawyer-facing {@link VerificationReport} from pipeline output. */
export function buildVerificationReport(
  matterId: string,
  query: string,
  pipeline: CitationSafetyPipelineResult
): VerificationReport {
  const results = mapToVerificationResults(pipeline.verificationResults);
  const flagged = results.filter(
    (r) => r.status === "hallucinated" || r.status === "unverified"
  );

  const sectionMappings: SectionMapping[] =
    pipeline.sectionNormalization.replacements.map((r) => ({
      originalSection: r.oldSection,
      normalizedSection: r.newSection,
      actOrStatute: r.newAct,
      confidence: 1,
    }));

  const citations: Citation[] = pipeline.extractedCitations.map((e, i) => ({
    id: `ext-${i}`,
    rawText: e.citationText,
    startOffset: e.startIndex,
    endOffset: e.endIndex,
  }));

  return {
    id: `report-${Date.now()}`,
    matterId,
    query: pipeline.normalizedQuery,
    citations,
    results,
    sectionMappings,
    summary: {
      totalCitations: pipeline.annotationSummary.total,
      verifiedCount: pipeline.annotationSummary.verified,
      flaggedCount: flagged.length,
      hallucinationCount: pipeline.annotationSummary.removed,
    },
    generatedAt: new Date().toISOString(),
  };
}

/** Rebuilds a report from persisted session columns when `verification_report` JSONB is absent. */
export function rebuildVerificationReportFromSession(
  session: CitationSessionRecord,
  matterId = "restored-session"
): VerificationReport | null {
  if (session.verificationReport) {
    return session.verificationReport;
  }

  const hasResults = session.verificationResults.length > 0;
  const hasExtractions = session.extractedCitations.length > 0;
  const hasAnnotated = session.annotatedResponse.trim().length > 0;

  if (!hasResults && !hasExtractions && !hasAnnotated) {
    return null;
  }

  const summary = session.verificationSummary;
  const flagged = session.verificationResults.filter(
    (r) => r.status === "hallucinated" || r.status === "unverified"
  );

  const sectionMappings: SectionMapping[] = session.sectionAlerts
    .filter((a) => a.oldSection && a.newSection)
    .map((a) => ({
      originalSection: a.oldSection!,
      normalizedSection: a.newSection!,
      actOrStatute: a.newAct,
      confidence: 1,
    }));

  const citations: Citation[] = session.extractedCitations.map((e, i) => ({
    id: `ext-${i}`,
    rawText: e.citationText,
    startOffset: e.startIndex,
    endOffset: e.endIndex,
  }));

  return {
    id: `report-${session.id}`,
    matterId,
    query: session.normalizedQuery || session.query,
    citations,
    results: session.verificationResults,
    sectionMappings,
    summary: {
      totalCitations: summary?.total ?? session.verificationResults.length,
      verifiedCount: summary?.verified ?? 0,
      flaggedCount: flagged.length,
      hallucinationCount: summary?.removed ?? 0,
    },
    generatedAt: session.updatedAt || session.createdAt,
  };
}

/** Builds a report from in-memory dashboard fields when `state.report` was cleared. */
export function buildReportFromDashboardFields(input: {
  query: string;
  matterId?: string;
  verificationResults: VerificationResult[];
  sectionAlerts: SectionNormalizationAlert[];
  extractedCitationTexts?: string[];
  annotationSummary?: CitationAnnotationSummary | null;
  generatedAt?: string;
}): VerificationReport | null {
  const {
    query,
    matterId = "current-run",
    verificationResults,
    sectionAlerts,
    extractedCitationTexts = [],
    annotationSummary,
    generatedAt,
  } = input;

  if (
    verificationResults.length === 0 &&
    extractedCitationTexts.length === 0
  ) {
    return null;
  }

  const flagged = verificationResults.filter(
    (r) => r.status === "hallucinated" || r.status === "unverified"
  );

  const sectionMappings: SectionMapping[] = sectionAlerts
    .filter((a) => a.oldSection && a.newSection)
    .map((a) => ({
      originalSection: a.oldSection!,
      normalizedSection: a.newSection!,
      actOrStatute: a.newAct,
      confidence: 1,
    }));

  const citations: Citation[] = extractedCitationTexts.map((rawText, i) => ({
    id: `ext-${i}`,
    rawText,
    startOffset: 0,
    endOffset: rawText.length,
  }));

  return {
    id: `report-${Date.now()}`,
    matterId,
    query,
    citations,
    results: verificationResults,
    sectionMappings,
    summary: {
      totalCitations:
        annotationSummary?.total ?? verificationResults.length,
      verifiedCount: annotationSummary?.verified ?? 0,
      flaggedCount: flagged.length,
      hallucinationCount: annotationSummary?.removed ?? 0,
    },
    generatedAt: generatedAt ?? new Date().toISOString(),
  };
}
