import { EmptyStateCard } from "@/components/EmptyStateCard";
import { SourceBadge } from "@/components/SourceBadge";
import { dedupeSectionAlerts } from "@/lib/report-utils";
import type {
  SectionNormalizationAlert,
  VerificationResult,
} from "@/lib/types";

interface CitationAlertsProps {
  results?: VerificationResult[];
  sectionAlerts?: SectionNormalizationAlert[];
}

function formatSectionMapping(alert: SectionNormalizationAlert): string {
  if (
    alert.oldAct &&
    alert.oldSection &&
    alert.newAct &&
    alert.newSection
  ) {
    return `${alert.oldSection} ${alert.oldAct} → ${alert.newSection} ${alert.newAct}`;
  }
  return `${alert.original} → ${alert.normalized}`;
}

export function CitationAlerts({
  results = [],
  sectionAlerts = [],
}: CitationAlertsProps) {
  const flagged = results.filter(
    (r) => r.status === "hallucinated" || r.status === "unverified"
  );

  const uniqueSectionAlerts = dedupeSectionAlerts(sectionAlerts);
  const hasSectionAlerts = uniqueSectionAlerts.length > 0;
  const hasCitationAlerts = flagged.length > 0;
  const hasAnyResults = results.length > 0;

  if (!hasCitationAlerts && !hasSectionAlerts) {
    if (!hasAnyResults && sectionAlerts.length === 0) {
      return (
        <aside className="glass-card rounded-xl p-4">
          <EmptyStateCard
            icon="alerts"
            title="No alerts yet"
            description="Run citation verification to surface flagged citations and statute normalization warnings."
          />
        </aside>
      );
    }
    return (
      <aside className="glass-card rounded-xl px-4 py-3">
        <p className="text-sm text-muted">
          No citation or section alerts — all citations verified and statutes
          current.
        </p>
      </aside>
    );
  }

  return (
    <div className="space-y-3">
      {hasCitationAlerts && (
        <aside className="glass-card rounded-xl border-danger/20 bg-danger-muted px-4 py-3">
          <h3 className="text-sm font-semibold text-danger">
            Citation alerts ({flagged.length})
          </h3>
          <ul className="mt-2 space-y-2">
            {flagged.map((result) => (
              <li
                key={result.citationId}
                className="flex flex-wrap items-start gap-2 text-sm text-foreground"
              >
                <SourceBadge source={result.source} />
                <div className="min-w-0 flex-1">
                  {result.citationText && (
                    <span className="block font-mono text-xs text-foreground/90">
                      {result.citationText}
                    </span>
                  )}
                  <span className="font-medium capitalize">{result.status}</span>
                  {result.sourceTitle && (
                    <span className="text-muted"> — {result.sourceTitle}</span>
                  )}
                  {result.notes && (
                    <span className="block text-xs text-muted">
                      {result.notes}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </aside>
      )}

      {hasSectionAlerts ? (
        <aside className="glass-card rounded-xl border-warning/25 bg-warning/[0.04] px-4 py-3">
          <h3 className="text-sm font-semibold text-warning">
            Section normalization ({uniqueSectionAlerts.length})
          </h3>
          <ul className="mt-2 space-y-2">
            {uniqueSectionAlerts.map((alert) => (
              <li
                key={formatSectionMapping(alert)}
                className="text-sm text-foreground"
              >
                <span className="font-medium">{alert.severity}</span>
                {": "}
                <span className="font-mono text-xs">
                  {formatSectionMapping(alert)}
                </span>
                {alert.message && (
                  <span className="block text-xs text-muted">
                    {alert.message}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </aside>
      ) : hasAnyResults ? (
        <aside className="glass-card rounded-xl px-4 py-3">
          <EmptyStateCard
            icon="sections"
            title="No statute normalization required"
            description="No IPC/CrPC/IEA sections in this response needed mapping to BNS/BNSS/BSA."
          />
        </aside>
      ) : null}
    </div>
  );
}
