import type { CitationAnnotationState } from "@/lib/types";

/** Inline badge labels embedded in annotated pipeline output. */
export const CITATION_BADGE_LABELS: Record<CitationAnnotationState, string> = {
  VERIFIED: "(Verified)",
  UNVERIFIED: "(Unverified)",
  REMOVED: "(Removed: hallucinated citation)",
  CORRECTED: "(Corrected)",
};

/** Legacy bracket labels (older saved sessions). */
export const LEGACY_CITATION_BADGE_LABELS: Record<CitationAnnotationState, string> =
  {
    VERIFIED: "[VERIFIED]",
    UNVERIFIED: "[UNVERIFIED — not found in Indian Kanoon]",
    REMOVED: "[REMOVED — hallucinated or impossible citation]",
    CORRECTED: "[CORRECTED — formatting normalized]",
  };

const ALL_BADGE_LITERALS = [
  ...Object.values(CITATION_BADGE_LABELS),
  ...Object.values(LEGACY_CITATION_BADGE_LABELS),
].sort((a, b) => b.length - a.length);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CITATION_BADGE_PATTERN_SOURCE = `(${ALL_BADGE_LITERALS.map(escapeRegExp).join("|")})`;

/** Matches any known citation status badge in annotated text (non-global for safe reuse). */
export const CITATION_BADGE_PATTERN = new RegExp(CITATION_BADGE_PATTERN_SOURCE);

export function matchCitationBadge(text: string): RegExpMatchArray | null {
  return text.match(CITATION_BADGE_PATTERN);
}

export function includesVerifiedBadge(text: string): boolean {
  return (
    text.includes(CITATION_BADGE_LABELS.VERIFIED) ||
    text.includes(LEGACY_CITATION_BADGE_LABELS.VERIFIED)
  );
}

export function resolveBadgeState(badge: string): CitationAnnotationState | null {
  const normalized = badge.trim();
  for (const state of Object.keys(CITATION_BADGE_LABELS) as CitationAnnotationState[]) {
    if (
      normalized === CITATION_BADGE_LABELS[state] ||
      normalized === LEGACY_CITATION_BADGE_LABELS[state] ||
      normalized.startsWith(LEGACY_CITATION_BADGE_LABELS[state].slice(0, 10))
    ) {
      return state;
    }
  }
  if (normalized.startsWith("[VERIFIED]") || normalized === "(Verified)") {
    return "VERIFIED";
  }
  if (normalized.startsWith("[REMOVED]") || normalized.startsWith("(Removed")) {
    return "REMOVED";
  }
  if (normalized.startsWith("[CORRECTED]") || normalized.startsWith("(Corrected")) {
    return "CORRECTED";
  }
  if (normalized.startsWith("[UNVERIFIED]") || normalized.startsWith("(Unverified")) {
    return "UNVERIFIED";
  }
  return null;
}

export const CITATION_BADGE_UI: Record<
  CitationAnnotationState,
  { label: string; className: string }
> = {
  VERIFIED: {
    label: "Verified",
    className: "border-success/40 bg-success/10 text-success",
  },
  REMOVED: {
    label: "Removed",
    className: "border-danger/40 bg-danger/10 text-danger",
  },
  CORRECTED: {
    label: "Corrected",
    className: "border-warning/45 bg-warning/10 text-warning",
  },
  UNVERIFIED: {
    label: "Unverified",
    className: "border-border bg-muted/15 text-muted",
  },
};
