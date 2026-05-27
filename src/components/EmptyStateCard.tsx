interface EmptyStateCardProps {
  title: string;
  description?: string;
  icon?: "citations" | "sections" | "alerts" | "report";
}

export function EmptyStateCard({
  title,
  description,
  icon = "citations",
}: EmptyStateCardProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/30 px-4 py-8 text-center">
      <span className="mb-2 text-2xl opacity-40" aria-hidden>
        {icon === "citations" && "§"}
        {icon === "sections" && "⚖"}
        {icon === "alerts" && "!"}
        {icon === "report" && "📋"}
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>
      )}
    </div>
  );
}
