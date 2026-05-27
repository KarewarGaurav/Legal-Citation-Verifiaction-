import {
  CITATION_BADGE_LABELS,
  includesVerifiedBadge,
} from "@/lib/citation-badges";
import type {
  CitationAnnotation,
  CitationAnnotationResult,
  CitationAnnotationState,
  CitationAnnotationSummary,
  CitationAnnotationTestReport,
  CitationVerificationResult,
} from "@/lib/types";

// -----------------------------------------------------------------------------
// Configuration — deterministic overlap resolution (no LLM reasoning)
// -----------------------------------------------------------------------------

/** Higher value wins when two annotation spans overlap the same character range. */
const ANNOTATION_STATE_PRIORITY: Record<CitationAnnotationState, number> = {
  REMOVED: 4,
  UNVERIFIED: 3,
  CORRECTED: 2,
  VERIFIED: 1,
};

// -----------------------------------------------------------------------------
// Normalization helpers
// -----------------------------------------------------------------------------

function normalizeCitationKey(citationText: string): string {
  return citationText.trim().replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a regex that matches the citation with flexible internal whitespace
 * so minor spacing drift in AI output still resolves to the same span.
 */
function buildFlexibleCitationPattern(citationText: string): RegExp {
  const tokens = normalizeCitationKey(citationText).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return /$^/;
  }
  const body = tokens.map(escapeRegExp).join("\\s+");
  return new RegExp(body, "g");
}

// -----------------------------------------------------------------------------
// Lawyer-safe / markdown-safe rendering
// -----------------------------------------------------------------------------

/**
 * Escapes characters that would break GFM when citations are wrapped in badges.
 * Keeps lawyer-visible text intact while preventing accidental emphasis or links.
 */
function escapeMarkdownInline(text: string): string {
  return text.replace(/([\\`*_[\]#<>!|])/g, "\\$1");
}

/**
 * Removes unsafe HTML/script/control characters from AI output before annotation.
 * Does not collapse intentional paragraph spacing — only strips active threats.
 */
export function stripUnsafeFormatting(text: string): string {
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/data:text\/html/gi, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/**
 * Renders the inline badge for a citation state (markdown-safe, emoji + label).
 * UI layers can map the same state to React components without re-parsing badges.
 */
export function generateAnnotationBadge(
  state: CitationAnnotationState,
  citationText: string,
  options?: { matchedCitation?: string }
): string {
  const safeCitation = escapeMarkdownInline(stripUnsafeFormatting(citationText));

  switch (state) {
    case "VERIFIED":
      return `✅ ${safeCitation}\n${CITATION_BADGE_LABELS.VERIFIED}`;
    case "UNVERIFIED":
      return `⚠️ ${safeCitation}\n${CITATION_BADGE_LABELS.UNVERIFIED}`;
    case "REMOVED":
      // Strikethrough signals “do not rely on this cite” while preserving audit trail.
      return `❌ ~~${safeCitation}~~\n${CITATION_BADGE_LABELS.REMOVED}`;
    case "CORRECTED": {
      const note =
        options?.matchedCitation &&
        normalizeCitationKey(options.matchedCitation) !==
          normalizeCitationKey(citationText)
          ? ` → ${escapeMarkdownInline(stripUnsafeFormatting(options.matchedCitation))}`
          : "";
      return `⚠️ ${safeCitation}${note}\n${CITATION_BADGE_LABELS.CORRECTED}`;
    }
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

// -----------------------------------------------------------------------------
// Verification → annotation state (deterministic)
// -----------------------------------------------------------------------------

function resolveAnnotationState(
  result: CitationVerificationResult
): CitationAnnotationState {
  if (result.status === "REMOVED") {
    return "REMOVED";
  }
  if (result.status === "CORRECTED") {
    return "CORRECTED";
  }
  if (result.status === "UNVERIFIED") {
    return "UNVERIFIED";
  }
  if (result.matchedCitation) {
    const cited = normalizeCitationKey(result.citationText).toLowerCase();
    const matched = normalizeCitationKey(result.matchedCitation).toLowerCase();
    if (cited !== matched) {
      return "CORRECTED";
    }
  }
  return "VERIFIED";
}

function buildAnnotationId(
  startIndex: number,
  endIndex: number,
  state: CitationAnnotationState,
  occurrenceIndex: number,
  citationText: string
): string {
  return `${startIndex}:${endIndex}:${state}:${occurrenceIndex}:${normalizeCitationKey(citationText)}`;
}

// -----------------------------------------------------------------------------
// Span discovery & overlap resolution
// -----------------------------------------------------------------------------

interface SpanCandidate {
  startIndex: number;
  endIndex: number;
  citationText: string;
  state: CitationAnnotationState;
  occurrenceIndex: number;
  verificationResult: CitationVerificationResult;
  matchedCitation?: string;
}

function findCitationOccurrences(
  text: string,
  citationText: string
): Array<{ startIndex: number; endIndex: number }> {
  const trimmed = citationText.trim();
  if (!trimmed) {
    return [];
  }

  const spans: Array<{ startIndex: number; endIndex: number }> = [];
  const seen = new Set<string>();

  const exactPattern = new RegExp(escapeRegExp(trimmed), "g");
  for (const match of text.matchAll(exactPattern)) {
    if (match.index === undefined) {
      continue;
    }
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;
    const key = `${startIndex}:${endIndex}`;
    if (!seen.has(key)) {
      seen.add(key);
      spans.push({ startIndex, endIndex });
    }
  }

  if (spans.length > 0) {
    return spans.sort((a, b) => a.startIndex - b.startIndex);
  }

  const flexible = buildFlexibleCitationPattern(trimmed);
  for (const match of text.matchAll(flexible)) {
    if (match.index === undefined) {
      continue;
    }
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;
    const key = `${startIndex}:${endIndex}`;
    if (!seen.has(key)) {
      seen.add(key);
      spans.push({ startIndex, endIndex });
    }
  }

  return spans.sort((a, b) => a.startIndex - b.startIndex);
}

function spansOverlap(
  a: { startIndex: number; endIndex: number },
  b: { startIndex: number; endIndex: number }
): boolean {
  return a.startIndex < b.endIndex && b.startIndex < a.endIndex;
}

/**
 * Deterministic ordering before overlap resolution:
 * 1. startIndex ascending (left-to-right reading order)
 * 2. endIndex descending (prefer longer span at same start)
 * 3. state priority descending (stricter legal signal wins)
 * 4. citationText lexicographic
 * 5. occurrenceIndex ascending
 */
function compareSpanCandidates(a: SpanCandidate, b: SpanCandidate): number {
  if (a.startIndex !== b.startIndex) {
    return a.startIndex - b.startIndex;
  }
  if (a.endIndex !== b.endIndex) {
    return b.endIndex - a.endIndex;
  }
  const priorityDiff =
    ANNOTATION_STATE_PRIORITY[b.state] - ANNOTATION_STATE_PRIORITY[a.state];
  if (priorityDiff !== 0) {
    return priorityDiff;
  }
  const textCmp = a.citationText.localeCompare(b.citationText, "en", {
    sensitivity: "base",
  });
  if (textCmp !== 0) {
    return textCmp;
  }
  return a.occurrenceIndex - b.occurrenceIndex;
}

/**
 * Greedy non-overlapping set: when spans collide, keep the higher-priority
 * annotation so lawyers never see conflicting badges on the same characters.
 */
function resolveNonOverlappingSpans(candidates: SpanCandidate[]): SpanCandidate[] {
  const ordered = [...candidates].sort(compareSpanCandidates);
  const selected: SpanCandidate[] = [];

  for (const candidate of ordered) {
    const conflictIndex = selected.findIndex((existing) =>
      spansOverlap(existing, candidate)
    );

    if (conflictIndex === -1) {
      selected.push(candidate);
      continue;
    }

    const existing = selected[conflictIndex];
    const existingPriority = ANNOTATION_STATE_PRIORITY[existing.state];
    const candidatePriority = ANNOTATION_STATE_PRIORITY[candidate.state];

    if (candidatePriority > existingPriority) {
      selected[conflictIndex] = candidate;
    } else if (
      candidatePriority === existingPriority &&
      candidate.endIndex - candidate.startIndex >
        existing.endIndex - existing.startIndex
    ) {
      selected[conflictIndex] = candidate;
    }
  }

  return selected.sort((a, b) => {
    if (a.startIndex !== b.startIndex) {
      return a.startIndex - b.startIndex;
    }
    if (a.endIndex !== b.endIndex) {
      return a.endIndex - b.endIndex;
    }
    return a.occurrenceIndex - b.occurrenceIndex;
  });
}

function collectSpanCandidates(
  text: string,
  verificationResults: CitationVerificationResult[]
): SpanCandidate[] {
  const candidates: SpanCandidate[] = [];
  const resultsByKey = new Map<string, CitationVerificationResult[]>();

  for (const result of verificationResults) {
    const key = normalizeCitationKey(result.citationText);
    const bucket = resultsByKey.get(key) ?? [];
    bucket.push(result);
    resultsByKey.set(key, bucket);
  }

  for (const [, results] of resultsByKey) {
    const result = results[0];
    if (!result) {
      continue;
    }

    const occurrences = findCitationOccurrences(text, result.citationText);

    occurrences.forEach((span, occurrenceIndex) => {
      const matchedResult = results[occurrenceIndex] ?? result;
      candidates.push({
        startIndex: span.startIndex,
        endIndex: span.endIndex,
        citationText: text.slice(span.startIndex, span.endIndex),
        state: resolveAnnotationState(matchedResult),
        occurrenceIndex,
        verificationResult: matchedResult,
        matchedCitation: matchedResult.matchedCitation,
      });
    });
  }

  return candidates;
}

function spanCandidatesToAnnotations(
  candidates: SpanCandidate[]
): CitationAnnotation[] {
  return candidates.map((candidate) => {
    const badge = generateAnnotationBadge(candidate.state, candidate.citationText, {
      matchedCitation: candidate.matchedCitation,
    });

    return {
      id: buildAnnotationId(
        candidate.startIndex,
        candidate.endIndex,
        candidate.state,
        candidate.occurrenceIndex,
        candidate.citationText
      ),
      citationText: candidate.citationText,
      state: candidate.state,
      startIndex: candidate.startIndex,
      endIndex: candidate.endIndex,
      badge,
      displayText: badge,
      occurrenceIndex: candidate.occurrenceIndex,
      verificationResult: candidate.verificationResult,
      matchedCitation: candidate.matchedCitation,
    };
  });
}

// -----------------------------------------------------------------------------
// Text assembly — preserve surrounding formatting
// -----------------------------------------------------------------------------

/**
 * Replaces citation spans with pre-rendered badges.
 * Applies from end → start so indices remain valid (lawyer-safe, no offset drift).
 */
export function applyCitationAnnotations(
  text: string,
  annotations: CitationAnnotation[]
): string {
  const ordered = [...annotations].sort((a, b) => {
    if (b.startIndex !== a.startIndex) {
      return b.startIndex - a.startIndex;
    }
    if (b.endIndex !== a.endIndex) {
      return b.endIndex - a.endIndex;
    }
    return a.id.localeCompare(b.id, "en");
  });

  let result = text;
  for (const annotation of ordered) {
    const before = result.slice(0, annotation.startIndex);
    const after = result.slice(annotation.endIndex);
    result = `${before}${annotation.displayText}${after}`;
  }

  return result;
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

export function generateAnnotationSummary(
  annotations: CitationAnnotation[]
): CitationAnnotationSummary {
  const total = annotations.length;
  let verified = 0;
  let corrected = 0;
  let unverified = 0;
  let removed = 0;

  for (const annotation of annotations) {
    switch (annotation.state) {
      case "VERIFIED":
        verified += 1;
        break;
      case "CORRECTED":
        corrected += 1;
        break;
      case "UNVERIFIED":
        unverified += 1;
        break;
      case "REMOVED":
        removed += 1;
        break;
      default:
        break;
    }
  }

  const lawyerSafe = verified + corrected;
  const accuracyPercentage =
    total > 0 ? Math.round((lawyerSafe / total) * 100) : 100;

  return {
    total,
    verified,
    corrected,
    unverified,
    removed,
    accuracyPercentage,
  };
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Transforms raw AI legal output into visually annotated, lawyer-safe text.
 * Deterministic only — maps verification results to badges; no LLM reasoning.
 */
export function annotateCitations(
  originalText: string,
  verificationResults: CitationVerificationResult[]
): CitationAnnotationResult {
  const sanitizedText = stripUnsafeFormatting(originalText);
  const candidates = collectSpanCandidates(sanitizedText, verificationResults);
  const resolved = resolveNonOverlappingSpans(candidates);
  const annotations = spanCandidatesToAnnotations(resolved);
  const annotatedText = applyCitationAnnotations(sanitizedText, annotations);
  const summary = generateAnnotationSummary(annotations);

  return {
    annotatedText,
    annotations,
    summary,
  };
}

// -----------------------------------------------------------------------------
// Smoke test
// -----------------------------------------------------------------------------

export const CITATION_ANNOTATION_SAMPLE_TEXT =
  "The Hon'ble Court in (2021) 10 SCC 1 held that bail is discretionary. " +
  "Reliance was also placed on (2099) 99 SCC 99999, which does not exist. " +
  "A mis-typed reporter cite (2021)10 SCC 2 appears in the draft. " +
  "Finally, AIR 9999 SC 1 could not be matched in Indian Kanoon.";

export const CITATION_ANNOTATION_SAMPLE_RESULTS: CitationVerificationResult[] = [
  {
    citationText: "(2021) 10 SCC 1",
    status: "VERIFIED",
    source: "INDIAN_KANOON",
    verifiedAt: "2026-01-01T00:00:00.000Z",
    confidence: 0.95,
    matchedCitation: "(2021) 10 SCC 1",
  },
  {
    citationText: "(2099) 99 SCC 99999",
    status: "REMOVED",
    source: "HALLUCINATION_RULE",
    verifiedAt: "2026-01-01T00:00:00.000Z",
    confidence: 0.99,
    metadata: { triggeredRules: ["RULE_FUTURE_YEAR"] },
  },
  {
    citationText: "(2021)10 SCC 2",
    status: "VERIFIED",
    source: "INDIAN_KANOON",
    verifiedAt: "2026-01-01T00:00:00.000Z",
    confidence: 0.9,
    matchedCitation: "(2021) 10 SCC 2",
  },
  {
    citationText: "AIR 9999 SC 1",
    status: "UNVERIFIED",
    source: "INDIAN_KANOON",
    verifiedAt: "2026-01-01T00:00:00.000Z",
    confidence: 0.55,
  },
];

/**
 * Smoke-test helper: exercises verified, removed, corrected, and unverified paths.
 */
export function testCitationAnnotation(): CitationAnnotationTestReport {
  const started = Date.now();
  const result = annotateCitations(
    CITATION_ANNOTATION_SAMPLE_TEXT,
    CITATION_ANNOTATION_SAMPLE_RESULTS
  );

  const checks: string[] = [];
  const states = new Set(result.annotations.map((a) => a.state));

  if (states.has("VERIFIED")) {
    checks.push("VERIFIED present");
  } else {
    checks.push("VERIFIED missing");
  }
  if (states.has("REMOVED")) {
    checks.push("REMOVED present");
  } else {
    checks.push("REMOVED missing");
  }
  if (states.has("CORRECTED")) {
    checks.push("CORRECTED present");
  } else {
    checks.push("CORRECTED missing");
  }
  if (states.has("UNVERIFIED")) {
    checks.push("UNVERIFIED present");
  } else {
    checks.push("UNVERIFIED missing");
  }

  if (includesVerifiedBadge(result.annotatedText)) {
    checks.push("annotatedText contains VERIFIED badge");
  }
  if (result.annotatedText.includes("~~")) {
    checks.push("annotatedText contains strikethrough for REMOVED");
  }
  if (result.summary.total >= 4) {
    checks.push("summary.total >= 4");
  } else {
    checks.push(`summary.total=${result.summary.total} (expected >= 4)`);
  }

  const passed =
    states.has("VERIFIED") &&
    states.has("REMOVED") &&
    states.has("CORRECTED") &&
    states.has("UNVERIFIED") &&
    result.summary.total >= 4 &&
    includesVerifiedBadge(result.annotatedText);

  return {
    sampleText: CITATION_ANNOTATION_SAMPLE_TEXT,
    verificationResults: CITATION_ANNOTATION_SAMPLE_RESULTS,
    result,
    passed,
    durationMs: Date.now() - started,
    checks,
  };
}
