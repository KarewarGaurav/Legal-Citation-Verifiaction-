import type { PipelineProcessingMetrics } from "@/lib/types";

interface ProcessingMetricsProps {
  metrics: PipelineProcessingMetrics | null;
}

export function ProcessingMetrics({ metrics }: ProcessingMetricsProps) {
  if (!metrics) return null;

  const timingRows = [
    { label: "Extraction", ms: metrics.extractionMs },
    { label: "Verification", ms: metrics.verificationMs },
    { label: "Annotation", ms: metrics.annotationMs },
    { label: "Total pipeline", ms: metrics.totalMs, highlight: true },
  ];

  const costRows = [
    { label: "Cache hits", value: metrics.cacheHits },
    { label: "IK API calls", value: metrics.ikApiCalls },
    {
      label: "Pre-filtered",
      value: metrics.preFilterRemovedCount,
      hint: "Hallucination rules",
    },
    {
      label: "Est. API cost",
      value: `₹${metrics.ikApiCostInr.toFixed(2)}`,
      highlight: metrics.ikApiCostInr > 0,
    },
  ];

  return (
    <section className="glass-card animate-fade-in rounded-xl px-4 py-3 stagger-2">
      <h3 className="text-sm font-semibold text-foreground">
        Processing metrics
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        {metrics.citationCount} citation
        {metrics.citationCount === 1 ? "" : "s"} processed
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {costRows.map((row) => (
          <div
            key={row.label}
            className="rounded-md border border-border/50 bg-background/35 px-2.5 py-2"
          >
            <dt className="text-[10px] uppercase tracking-wide text-muted">
              {row.label}
            </dt>
            <dd
              className={`mt-0.5 text-sm font-semibold tabular-nums ${
                row.highlight ? "text-accent" : "text-foreground"
              }`}
            >
              {row.value}
            </dd>
            {row.hint && (
              <p className="mt-0.5 text-[10px] text-muted">{row.hint}</p>
            )}
          </div>
        ))}
      </dl>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {timingRows.map((row) => (
          <div key={row.label}>
            <dt className="text-xs text-muted">{row.label}</dt>
            <dd
              className={`mt-0.5 text-sm font-semibold tabular-nums ${
                row.highlight ? "text-accent" : "text-foreground"
              }`}
            >
              {formatMs(row.ms)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
