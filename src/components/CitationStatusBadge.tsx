import {
  CITATION_BADGE_UI,
  resolveBadgeState,
} from "@/lib/citation-badges";
import type { CitationAnnotationState } from "@/lib/types";

interface CitationStatusBadgeProps {
  state: CitationAnnotationState;
  /** Compact pill for inline annotated text; default for annotation list. */
  size?: "inline" | "list";
  className?: string;
}

export function CitationStatusBadge({
  state,
  size = "list",
  className = "",
}: CitationStatusBadgeProps) {
  const ui = CITATION_BADGE_UI[state];
  const sizeClass =
    size === "inline"
      ? "my-0.5 mx-1 px-2 py-0.5 text-[11px] font-medium"
      : "px-2 py-0.5 text-xs font-semibold";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border ${sizeClass} ${ui.className} ${className}`}
    >
      {ui.label}
    </span>
  );
}

interface CitationStatusBadgeFromTextProps {
  badgeText: string;
  size?: "inline" | "list";
}

/** Renders a badge from raw pipeline label text (current or legacy). */
export function CitationStatusBadgeFromText({
  badgeText,
  size = "inline",
}: CitationStatusBadgeFromTextProps) {
  const state = resolveBadgeState(badgeText);
  if (!state) {
    return (
      <span className="my-0.5 mx-1 inline rounded-md border border-border bg-muted/10 px-2 py-0.5 text-[11px] text-muted">
        {badgeText}
      </span>
    );
  }
  return <CitationStatusBadge state={state} size={size} />;
}
