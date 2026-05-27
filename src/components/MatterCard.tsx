import type { Matter } from "@/lib/types";

interface MatterCardProps {
  matter: Matter;
  selected?: boolean;
  onSelect?: (matterId: string) => void;
}

export function MatterCard({ matter, selected = false, onSelect }: MatterCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(matter.id)}
      className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
        selected
          ? "border-accent bg-surface shadow-sm"
          : "border-border bg-surface hover:border-accent/40"
      }`}
    >
      <p className="text-sm font-medium text-foreground">{matter.name}</p>
      {matter.client && (
        <p className="mt-1 text-xs text-muted">{matter.client}</p>
      )}
      {matter.description && (
        <p className="mt-2 line-clamp-2 text-xs text-muted">{matter.description}</p>
      )}
    </button>
  );
}
