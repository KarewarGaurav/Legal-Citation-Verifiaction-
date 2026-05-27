import type {
  PipelineProcessingMetrics,
  SectionNormalizationAlert,
  UniqueReportCitation,
  VerificationReport,
  VerificationResult,
  VerificationStatus,
} from "@/lib/types";

/** Stable key for deduplicating section normalization alerts. */
export function sectionAlertKey(alert: SectionNormalizationAlert): string {
  const oldAct = (alert.oldAct ?? "").trim().toUpperCase();
  const oldSection = (alert.oldSection ?? "").trim().toUpperCase();
  const newAct = (alert.newAct ?? "").trim().toUpperCase();
  const newSection = (alert.newSection ?? "").trim().toUpperCase();
  if (oldAct && oldSection && newAct && newSection) {
    return `${oldAct}:${oldSection}→${newAct}:${newSection}`;
  }
  return `${alert.original}→${alert.normalized}`;
}

/** Returns one alert per unique statute mapping (oldAct/oldSection/newAct/newSection). */
export function dedupeSectionAlerts(
  alerts: SectionNormalizationAlert[]
): SectionNormalizationAlert[] {
  const seen = new Map<string, SectionNormalizationAlert>();
  for (const alert of alerts) {
    const key = sectionAlertKey(alert);
    if (!seen.has(key)) {
      seen.set(key, alert);
    }
  }
  return Array.from(seen.values());
}

function normalizeCitationKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Aggregates verification rows by citation text for the report UI only. */
export function dedupeReportCitations(
  results: VerificationResult[],
  citationTexts?: string[]
): UniqueReportCitation[] {
  const byKey = new Map<
    string,
    {
      citationText: string;
      status: VerificationStatus;
      confidence: number;
      source?: VerificationResult["source"];
      count: number;
    }
  >();

  results.forEach((r, index) => {
    const text =
      r.citationText?.trim() ||
      citationTexts?.[index]?.trim() ||
      r.sourceTitle?.trim() ||
      r.citationId;
    const key = normalizeCitationKey(text);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      if (r.confidence > existing.confidence) {
        existing.confidence = r.confidence;
        existing.status = r.status;
        existing.source = r.source ?? existing.source;
      }
    } else {
      byKey.set(key, {
        citationText: text,
        status: r.status,
        confidence: r.confidence,
        source: r.source,
        count: 1,
      });
    }
  });

  return Array.from(byKey.values()).map((row) => ({
    citationText: row.citationText,
    status: row.status,
    confidence: row.confidence,
    occurrenceCount: row.count,
    source: row.source,
  }));
}

export interface ReportExportPayload {
  query: string;
  generatedAt: string;
  citations: UniqueReportCitation[];
  extractedCitationTexts: string[];
  sectionMappings: VerificationReport["sectionMappings"];
  summary: VerificationReport["summary"];
  metrics: PipelineProcessingMetrics | null;
  annotationAccuracy?: number;
}

export function buildReportExportPayload(
  report: VerificationReport,
  options?: {
    metrics?: PipelineProcessingMetrics | null;
    annotationAccuracy?: number;
  }
): ReportExportPayload {
  const unique = dedupeReportCitations(
    report.results,
    report.citations.map((c) => c.rawText)
  );
  return {
    query: report.query,
    generatedAt: report.generatedAt,
    citations: unique,
    extractedCitationTexts: report.citations.map((c) => c.rawText),
    sectionMappings: report.sectionMappings,
    summary: report.summary,
    metrics: options?.metrics ?? null,
    annotationAccuracy: options?.annotationAccuracy,
  };
}

export function formatReportAsText(payload: ReportExportPayload): string {
  const lines: string[] = [
    "BRAHMO Citation Safety Engine — Verification Report",
    "=".repeat(56),
    "",
    `Query: ${payload.query}`,
    `Generated: ${new Date(payload.generatedAt).toLocaleString()}`,
    "",
    "Summary",
    "-".repeat(40),
    `Total citations: ${payload.summary.totalCitations}`,
    `Verified: ${payload.summary.verifiedCount}`,
    `Flagged: ${payload.summary.flaggedCount}`,
    `Hallucinations removed: ${payload.summary.hallucinationCount}`,
  ];

  if (payload.annotationAccuracy != null) {
    lines.push(`Accuracy: ${payload.annotationAccuracy}%`);
  }

  if (payload.metrics) {
    lines.push(
      "",
      "Processing metrics",
      "-".repeat(40),
      `Cache hits: ${payload.metrics.cacheHits}`,
      `Indian Kanoon API calls: ${payload.metrics.ikApiCalls}`,
      `Hallucinations pre-filtered: ${payload.metrics.preFilterRemovedCount}`,
      `Estimated API cost: ₹${payload.metrics.ikApiCostInr.toFixed(2)}`,
      `Pipeline total: ${Math.round(payload.metrics.totalMs)} ms`
    );
  }

  lines.push("", "Citations (unique)", "-".repeat(40));
  if (payload.citations.length === 0) {
    lines.push("No citations detected.");
  } else {
    for (const c of payload.citations) {
      lines.push(
        `${c.citationText}`,
        `  Status: ${c.status.toUpperCase()}`,
        `  Confidence: ${(c.confidence * 100).toFixed(0)}%`,
        `  Occurrences: ${c.occurrenceCount}`,
        c.source ? `  Source: ${c.source}` : "",
        ""
      );
    }
  }

  lines.push("Section mappings", "-".repeat(40));
  if (payload.sectionMappings.length === 0) {
    lines.push("No statute normalization required.");
  } else {
    for (const m of payload.sectionMappings) {
      lines.push(
        `${m.originalSection} → ${m.normalizedSection}${
          m.actOrStatute ? ` (${m.actOrStatute})` : ""
        }`
      );
    }
  }

  return lines.filter((l) => l !== undefined).join("\n");
}
