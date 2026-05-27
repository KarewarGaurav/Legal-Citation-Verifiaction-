import type { CitationVerificationSource } from "@/lib/types";

const SOURCE_STYLES: Record<
  CitationVerificationSource,
  { label: string; className: string }
> = {
  CACHE: {
    label: "CACHE",
    className: "border-accent/35 bg-accent/10 text-accent",
  },
  INDIAN_KANOON: {
    label: "IK",
    className: "border-success/35 bg-success/10 text-success",
  },
  HALLUCINATION_RULE: {
    label: "RULE",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
};

interface SourceBadgeProps {
  source?: CitationVerificationSource | null;
  compact?: boolean;
}

export function SourceBadge({ source, compact = true }: SourceBadgeProps) {
  if (!source) return null;
  const config = SOURCE_STYLES[source];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded font-mono font-semibold uppercase tracking-wide ${
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
      } ${config.className}`}
      title={
        source === "INDIAN_KANOON"
          ? "Indian Kanoon"
          : source === "HALLUCINATION_RULE"
            ? "Hallucination rule pre-filter"
            : "Verification cache"
      }
    >
      {config.label}
    </span>
  );
}
