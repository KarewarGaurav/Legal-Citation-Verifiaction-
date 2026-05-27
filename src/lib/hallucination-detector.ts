import type {
  CitationExtractedMetadata,
  HallucinationDetectionResult,
  HallucinationDetectionTestReport,
  HallucinationRuleId,
} from "@/lib/types";

// -----------------------------------------------------------------------------
// Rule identifiers (stable for logging, UI, and future rule registry)
// -----------------------------------------------------------------------------

export const RULE_FUTURE_YEAR: HallucinationRuleId = "RULE_FUTURE_YEAR";
export const RULE_IMPOSSIBLE_VOLUME: HallucinationRuleId =
  "RULE_IMPOSSIBLE_VOLUME";
export const RULE_SUSPICIOUS_PAGE: HallucinationRuleId = "RULE_SUSPICIOUS_PAGE";
export const RULE_PRE_MODERN: HallucinationRuleId = "RULE_PRE_MODERN";

/** Maximum SCC volume number considered plausible (inclusive). */
const MAX_PLAUSIBLE_SCC_VOLUME = 25;

/** Page numbers above this threshold are flagged as suspicious. */
const MAX_PLAUSIBLE_PAGE = 5000;

/** Years before this threshold are flagged as suspicious (pre-modern). */
const PRE_MODERN_YEAR_THRESHOLD = 1900;

// -----------------------------------------------------------------------------
// Metadata extraction
// -----------------------------------------------------------------------------

/** `(YYYY) VOL REPORTER PAGE` — primary Indian reporter tuple. */
const PAREN_YEAR_REPORTER_RE =
  /\((\d{4})\)\s*(\d+)\s*(SCC(?:\s+OnLine)?|SCR|AIR|MANU|Cri\s*LJ)\s*(\d+)/i;

/** `YYYY VOL REPORTER PAGE` without parentheses around the year. */
const LEADING_YEAR_REPORTER_RE =
  /(?:^|[^\d])(\d{4})\s+(\d+)\s*(SCC(?:\s+OnLine)?|SCR|AIR|MANU|Cri\s*LJ)\s*(\d+)/i;

/** `AIR YYYY ...` style (year is second token). */
const AIR_YEAR_RE = /\bAIR\s+(\d{4})\b/i;

/**
 * Pulls year, volume, page, and reporter from common Indian citation shapes.
 * Returns partial metadata when only some fields match.
 */
export function extractCitationMetadata(
  citationText: string
): CitationExtractedMetadata {
  const trimmed = citationText.trim();
  if (!trimmed) {
    return {};
  }

  const tuple =
    trimmed.match(PAREN_YEAR_REPORTER_RE) ??
    trimmed.match(LEADING_YEAR_REPORTER_RE);

  if (tuple) {
    const reporter = tuple[3].replace(/\s+/g, " ").trim();
    return {
      year: Number.parseInt(tuple[1], 10),
      volume: Number.parseInt(tuple[2], 10),
      reporter,
      page: Number.parseInt(tuple[4], 10),
    };
  }

  const airYear = trimmed.match(AIR_YEAR_RE);
  if (airYear) {
    return {
      year: Number.parseInt(airYear[1], 10),
      reporter: "AIR",
    };
  }

  const standaloneYear = trimmed.match(/\((\d{4})\)/);
  if (standaloneYear) {
    return { year: Number.parseInt(standaloneYear[1], 10) };
  }

  return {};
}

// -----------------------------------------------------------------------------
// Rule engine (modular — append new rules to HALLUCINATION_RULES)
// -----------------------------------------------------------------------------

type RuleSeverity = "hallucinated" | "suspicious";

interface HallucinationRuleDefinition {
  id: HallucinationRuleId;
  severity: RuleSeverity;
  evaluate: (ctx: {
    metadata: CitationExtractedMetadata;
    currentYear: number;
  }) => boolean;
}

const HALLUCINATION_RULES: HallucinationRuleDefinition[] = [
  {
    id: RULE_FUTURE_YEAR,
    severity: "hallucinated",
    // RULE 1 — FUTURE YEAR: year more than one year beyond the current calendar year
    evaluate: ({ metadata, currentYear }) => {
      if (metadata.year === undefined || Number.isNaN(metadata.year)) {
        return false;
      }
      return metadata.year > currentYear + 1;
    },
  },
  {
    id: RULE_IMPOSSIBLE_VOLUME,
    severity: "hallucinated",
    // RULE 2 — IMPOSSIBLE SCC VOLUME: standard SCC volumes above 25 are not plausible
    evaluate: ({ metadata }) => {
      if (metadata.reporter?.toUpperCase() !== "SCC") {
        return false;
      }
      if (metadata.volume === undefined || Number.isNaN(metadata.volume)) {
        return false;
      }
      return metadata.volume > MAX_PLAUSIBLE_SCC_VOLUME;
    },
  },
  {
    id: RULE_SUSPICIOUS_PAGE,
    severity: "suspicious",
    // RULE 3 — IMPOSSIBLE PAGE NUMBER: very large page numbers warrant manual review
    evaluate: ({ metadata }) => {
      if (metadata.page === undefined || Number.isNaN(metadata.page)) {
        return false;
      }
      return metadata.page > MAX_PLAUSIBLE_PAGE;
    },
  },
  {
    id: RULE_PRE_MODERN,
    severity: "suspicious",
    // RULE 4 — PRE-MODERN YEAR: citations before 1900 are unusual for modern reporters
    evaluate: ({ metadata }) => {
      if (metadata.year === undefined || Number.isNaN(metadata.year)) {
        return false;
      }
      return metadata.year < PRE_MODERN_YEAR_THRESHOLD;
    },
  },
];

function runRules(
  metadata: CitationExtractedMetadata,
  currentYear: number
): HallucinationRuleId[] {
  const triggered: HallucinationRuleId[] = [];
  const ctx = { metadata, currentYear };

  for (const rule of HALLUCINATION_RULES) {
    if (rule.evaluate(ctx)) {
      triggered.push(rule.id);
    }
  }

  return triggered;
}

function severityFromRules(triggeredRules: HallucinationRuleId[]): {
  isHallucinated: boolean;
  isSuspicious: boolean;
} {
  const ids = new Set(triggeredRules);
  const isHallucinated =
    ids.has(RULE_FUTURE_YEAR) || ids.has(RULE_IMPOSSIBLE_VOLUME);
  const isSuspicious =
    ids.has(RULE_SUSPICIOUS_PAGE) || ids.has(RULE_PRE_MODERN);
  return { isHallucinated, isSuspicious };
}

/**
 * Deterministic confidence in the pre-filter assessment (0–1).
 * Higher values mean stronger certainty in the assigned flags.
 */
export function calculateHallucinationConfidence(
  triggeredRules: HallucinationRuleId[],
  isHallucinated: boolean,
  isSuspicious: boolean
): number {
  if (triggeredRules.length === 0) {
    return 0.92;
  }

  const ruleConfidence: Partial<Record<HallucinationRuleId, number>> = {
    [RULE_FUTURE_YEAR]: 0.98,
    [RULE_IMPOSSIBLE_VOLUME]: 0.97,
    [RULE_SUSPICIOUS_PAGE]: 0.72,
    [RULE_PRE_MODERN]: 0.68,
  };

  let maxTriggered = 0;
  for (const id of triggeredRules) {
    const weight = ruleConfidence[id] ?? 0.65;
    if (weight > maxTriggered) {
      maxTriggered = weight;
    }
  }

  if (isHallucinated) {
    return Math.min(1, Math.max(0.95, maxTriggered));
  }

  if (isSuspicious) {
    return Math.min(0.85, Math.max(0.65, maxTriggered));
  }

  return 0.5;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Pre-verification filter: flags impossible or suspicious Indian legal citations
 * using deterministic rules only (no LLM or external APIs).
 */
export function detectHallucinations(
  citationText: string
): HallucinationDetectionResult {
  const normalized = citationText.trim();
  const extractedMetadata = extractCitationMetadata(normalized);
  const currentYear = new Date().getFullYear();
  const triggeredRules = runRules(extractedMetadata, currentYear);
  const { isHallucinated, isSuspicious } = severityFromRules(triggeredRules);
  const confidence = calculateHallucinationConfidence(
    triggeredRules,
    isHallucinated,
    isSuspicious
  );

  return {
    citationText: normalized,
    isHallucinated,
    isSuspicious,
    confidence,
    triggeredRules,
    extractedMetadata,
  };
}

/** Runs {@link detectHallucinations} over many citation strings. */
export function batchDetectHallucinations(
  citations: string[]
): HallucinationDetectionResult[] {
  return citations.map((citationText) => detectHallucinations(citationText));
}

/** Built-in examples for smoke testing (see requirements). */
export const HALLUCINATION_DETECTION_SAMPLE_CITATIONS = [
  "(2028) 3 SCC 45",
  "(2024) 47 SCC 123",
  "(2024) 5 SCC 9999",
  "(1856) 3 SCC 45",
  "(2021) 10 SCC 1",
] as const;

const SAMPLE_EXPECTATIONS: Record<
  string,
  Pick<
    HallucinationDetectionResult,
    "isHallucinated" | "isSuspicious" | "triggeredRules"
  >
> = {
  "(2028) 3 SCC 45": {
    isHallucinated: true,
    isSuspicious: false,
    triggeredRules: [RULE_FUTURE_YEAR],
  },
  "(2024) 47 SCC 123": {
    isHallucinated: true,
    isSuspicious: false,
    triggeredRules: [RULE_IMPOSSIBLE_VOLUME],
  },
  "(2024) 5 SCC 9999": {
    isHallucinated: false,
    isSuspicious: true,
    triggeredRules: [RULE_SUSPICIOUS_PAGE],
  },
  "(1856) 3 SCC 45": {
    isHallucinated: false,
    isSuspicious: true,
    triggeredRules: [RULE_PRE_MODERN],
  },
  "(2021) 10 SCC 1": {
    isHallucinated: false,
    isSuspicious: false,
    triggeredRules: [],
  },
};

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

/**
 * Smoke-test helper: runs sample citations and checks expected flags.
 * Safe to call from scripts or dev consoles.
 */
export function testHallucinationDetection(): HallucinationDetectionTestReport {
  const started = Date.now();
  const cases = HALLUCINATION_DETECTION_SAMPLE_CITATIONS.map((citationText) => ({
    citationText,
    result: detectHallucinations(citationText),
  }));

  let passed = 0;
  let failed = 0;

  for (const { citationText, result } of cases) {
    const expected = SAMPLE_EXPECTATIONS[citationText];
    const ok =
      expected !== undefined &&
      result.isHallucinated === expected.isHallucinated &&
      result.isSuspicious === expected.isSuspicious &&
      arraysEqual(result.triggeredRules, expected.triggeredRules);

    if (ok) {
      passed += 1;
    } else {
      failed += 1;
    }
  }

  return {
    cases,
    passed,
    failed,
    durationMs: Date.now() - started,
  };
}
