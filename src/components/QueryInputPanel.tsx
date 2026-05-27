"use client";

import { getMatterQuery, LEGAL_MATTERS } from "@/lib/legal-matters";
import type { LoadingPhase } from "@/hooks/useBrahmoDashboard";

interface QueryInputPanelProps {
  query: string;
  onQueryChange: (query: string) => void;
  onScenarioSelect?: (matterId: string) => void;
  onAskGeneric: () => void;
  onAskVerified: () => void;
  isBusy: boolean;
  genericLoading: boolean;
  verifiedLoading: boolean;
  loadingPhase?: LoadingPhase;
  sessionTitle?: string;
  selectedMatterId?: string;
}

function verifiedButtonLabel(phase: LoadingPhase | undefined): string {
  switch (phase) {
    case "generating":
      return "Generating AI response...";
    case "extracting":
      return "Extracting citations...";
    case "verifying":
      return "Verifying citations...";
    case "annotating":
      return "Annotating response...";
    case "reporting":
      return "Generating report...";
    default:
      return "Verifying…";
  }
}

export function QueryInputPanel({
  query,
  onQueryChange,
  onScenarioSelect,
  onAskGeneric,
  onAskVerified,
  isBusy,
  genericLoading,
  verifiedLoading,
  loadingPhase,
  sessionTitle,
  selectedMatterId,
}: QueryInputPanelProps) {
  return (
    <div className="glass-card sticky top-0 z-20 rounded-xl p-4 transition-shadow">
      {sessionTitle && (
        <p className="mb-2 text-xs text-muted">
          Session:{" "}
          <span className="font-medium text-foreground">{sessionTitle}</span>
        </p>
      )}

      <label htmlFor="legal-query" className="sr-only">
        Legal query
      </label>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {LEGAL_MATTERS.map((matter) => (
          <button
            key={matter.id}
            type="button"
            onClick={() => {
              onScenarioSelect?.(matter.id);
              onQueryChange(getMatterQuery(matter.id));
            }}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              selectedMatterId === matter.id
                ? "border-accent/50 bg-accent/10 text-foreground"
                : "border-border/80 bg-background/50 text-muted hover:border-accent/40 hover:text-foreground"
            }`}
          >
            {matter.scenarioLabel}
          </button>
        ))}
      </div>

      <textarea
        id="legal-query"
        rows={3}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Enter your legal research question. Citations will be extracted and verified against Indian Kanoon."
        className="w-full resize-none rounded-lg border border-border/80 bg-background/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAskGeneric}
          disabled={isBusy}
          className="rounded-lg border border-danger/25 bg-danger-muted px-4 py-2 text-sm font-medium text-foreground transition-all hover:border-danger/40 disabled:opacity-50"
        >
          {genericLoading && !verifiedLoading ? (
            <LoadingLabel text="Generating…" />
          ) : (
            "Ask Generic AI"
          )}
        </button>
        <button
          type="button"
          onClick={onAskVerified}
          disabled={isBusy}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-all hover:bg-accent-hover disabled:opacity-50"
        >
          {verifiedLoading ? (
            <LoadingLabel text={verifiedButtonLabel(loadingPhase)} light />
          ) : (
            "Ask with Citation Verification"
          )}
        </button>
      </div>
    </div>
  );
}

function LoadingLabel({ text, light }: { text: string; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`h-1.5 w-1.5 rounded-full animate-pulse-soft ${
          light ? "bg-white/80" : "bg-accent"
        }`}
      />
      {text}
    </span>
  );
}
