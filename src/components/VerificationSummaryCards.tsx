import type { CitationAnnotationSummary } from "@/lib/types";

interface VerificationSummaryCardsProps {
  summary: CitationAnnotationSummary | null;
}

export function VerificationSummaryCards({
  summary,
}: VerificationSummaryCardsProps) {
  if (!summary) return null;

  const cards = [
    { label: "Total citations", value: summary.total, variant: "default" as const },
    { label: "Verified", value: summary.verified, variant: "success" as const },
    { label: "Unverified", value: summary.unverified, variant: "neutral" as const },
    { label: "Removed", value: summary.removed, variant: "danger" as const },
    { label: "Corrected", value: summary.corrected, variant: "warning" as const },
    {
      label: "Accuracy",
      value: `${summary.accuracyPercentage}%`,
      variant: "accent" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 animate-fade-in stagger-1">
      {cards.map((card) => (
        <div
          key={card.label}
          className="glass-card flex min-h-[4.25rem] flex-col justify-center rounded-lg px-3 py-2.5"
        >
          <p className="text-xs text-muted">{card.label}</p>
          <p
            className={`mt-0.5 text-lg font-semibold tabular-nums ${variantClass(card.variant)}`}
          >
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function variantClass(
  variant: "default" | "success" | "danger" | "warning" | "accent" | "neutral"
): string {
  switch (variant) {
    case "success":
      return "text-success";
    case "danger":
      return "text-danger";
    case "warning":
      return "text-warning";
    case "accent":
      return "text-accent";
    case "neutral":
      return "text-muted";
    default:
      return "text-foreground";
  }
}
