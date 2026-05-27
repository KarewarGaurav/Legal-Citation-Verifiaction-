import { CitationStatusBadge } from "@/components/CitationStatusBadge";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import { SourceBadge } from "@/components/SourceBadge";
import { dedupeReportCitations } from "@/lib/report-utils";
import type {
  CitationAnnotationState,
  CitationAnnotationSummary,
  PipelineProcessingMetrics,
  VerificationReport as VerificationReportData,
  VerificationResult,
} from "@/lib/types";

interface VerificationReportProps {
  report?: VerificationReportData | null;
  annotationSummary?: CitationAnnotationSummary | null;
  processingMetrics?: PipelineProcessingMetrics | null;
}

export function VerificationReport({
  report,
  annotationSummary,
}: VerificationReportProps) {
  if (!report) {
    return (
      <section className="glass-card rounded-xl p-4 sm:p-6">
        <h2 className="text-base font-semibold text-foreground">
          Verification Report
        </h2>
        <div className="mt-4">
          <EmptyStateCard
            icon="report"
            title="No report yet"
            description='Click "Ask with Citation Verification" (not "Ask Generic AI") to extract citations, verify against Indian Kanoon, and generate this report.'
          />
        </div>
      </section>
    );
  }

  const { summary, results, sectionMappings, citations, generatedAt, query } =
    report;

  const uniqueCitations = dedupeReportCitations(
    results,
    citations.map((c) => c.rawText)
  );

  const accuracy =
    annotationSummary?.accuracyPercentage ??
    (summary.totalCitations > 0
      ? Math.round(
          ((summary.verifiedCount +
            (annotationSummary?.corrected ?? 0)) /
            summary.totalCitations) *
            100
        )
      : 0);

  return (
    <section className="glass-card rounded-xl p-4 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between">
        <h2 className="text-base font-semibold text-foreground">
          Verification Report
        </h2>
        <time className="text-xs text-muted">
          {new Date(generatedAt).toLocaleString()}
        </time>
      </div>

      {query && (
        <p className="mt-2 break-words text-xs text-muted sm:line-clamp-2">
          Query: {query}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
        <Stat label="Unique citations" value={uniqueCitations.length} />
        <Stat label="Verified" value={summary.verifiedCount} variant="success" />
        <Stat
          label="Unverified"
          value={annotationSummary?.unverified ?? 0}
          variant="neutral"
        />
        <Stat
          label="Removed"
          value={annotationSummary?.removed ?? summary.hallucinationCount}
          variant="danger"
        />
        <Stat
          label="Corrected"
          value={annotationSummary?.corrected ?? 0}
          variant="warning"
        />
        <Stat label="Accuracy" value={`${accuracy}%`} variant="accent" />
      </dl>

      <div className="mt-6 space-y-5">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            Citation results ({uniqueCitations.length} unique)
          </h3>
          {uniqueCitations.length === 0 ? (
            <div className="mt-3">
              <EmptyStateCard
                icon="citations"
                title="No citations detected"
                description="The extractor did not find reporter-style citations in this response."
              />
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border">
              {uniqueCitations.map((c) => (
                <UniqueCitationRow key={c.citationText} citation={c} />
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium text-foreground">
            Extracted spans ({citations.length})
          </h3>
          {citations.length === 0 ? (
            <div className="mt-3">
              <EmptyStateCard
                icon="citations"
                title="No citations detected"
                description="No citation spans were extracted from the source text."
              />
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {citations.map((c) => (
                <li
                  key={c.id}
                  className="break-words rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 font-mono text-xs text-muted"
                >
                  {c.rawText}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium text-foreground">
            Section mappings ({sectionMappings.length})
          </h3>
          {sectionMappings.length === 0 ? (
            <div className="mt-3">
              <EmptyStateCard
                icon="sections"
                title="No statute normalization required"
                description="No legacy IPC/CrPC/IEA sections were replaced in this response."
              />
            </div>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {sectionMappings.map((m) => (
                <li
                  key={`${m.originalSection}-${m.normalizedSection}-${m.actOrStatute ?? ""}`}
                  className="break-words rounded-md border border-border/50 bg-background/30 px-2.5 py-1.5"
                >
                  <span className="text-muted">{m.originalSection}</span>
                  {" → "}
                  <span className="font-medium">{m.normalizedSection}</span>
                  {m.actOrStatute && (
                    <span className="text-xs text-muted">
                      {" "}
                      ({m.actOrStatute})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function UniqueCitationRow({
  citation,
}: {
  citation: ReturnType<typeof dedupeReportCitations>[number];
}) {
  const state = statusToBadgeState(citation.status);

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="break-words font-mono text-xs text-foreground">
          {citation.citationText}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {state ? (
            <CitationStatusBadge state={state} size="list" />
          ) : (
            <span className="text-sm font-medium capitalize text-foreground">
              {citation.status}
            </span>
          )}
          <SourceBadge source={citation.source} />
          <span className="text-xs text-muted">
            confidence {(citation.confidence * 100).toFixed(0)}%
          </span>
          {citation.occurrenceCount > 1 && (
            <span className="rounded-full bg-accent-muted px-2 py-0.5 text-[10px] font-medium text-accent">
              ×{citation.occurrenceCount} occurrences
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function statusToBadgeState(
  status: VerificationResult["status"]
): CitationAnnotationState | null {
  switch (status) {
    case "verified":
      return "VERIFIED";
    case "unverified":
    case "partial":
      return "UNVERIFIED";
    case "hallucinated":
      return "REMOVED";
    default:
      return null;
  }
}

function Stat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number | string;
  variant?: "success" | "warning" | "danger" | "accent" | "neutral";
}) {
  const colorClass =
    variant === "success"
      ? "text-success"
      : variant === "warning"
        ? "text-warning"
        : variant === "danger"
          ? "text-danger"
          : variant === "accent"
            ? "text-accent"
            : variant === "neutral"
              ? "text-muted"
              : "text-foreground";

  return (
    <div className="flex min-h-[4.25rem] flex-col justify-center rounded-md border border-border/60 bg-background/40 px-2.5 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold tabular-nums ${colorClass}`}>
        {value}
      </dd>
    </div>
  );
}
