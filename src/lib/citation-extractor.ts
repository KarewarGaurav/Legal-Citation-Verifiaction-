import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type {
  CitationExtractionTestReport,
  CitationPatternError,
  CitationPatternRecord,
  ExtractedCitation,
} from "@/lib/types";

// -----------------------------------------------------------------------------
// Configuration (patterns live in Supabase — not in source code)
// -----------------------------------------------------------------------------

const PATTERN_CACHE_TTL_MS = 5 * 60 * 1000;

/** Higher priority wins when two matches overlap the same span. */
const PATTERN_PRIORITY: Record<string, number> = {
  SCC: 100,
  SCC_OnLine: 100,
  AIR: 100,
  Cri_LJ: 100,
  SCR: 100,
  MANU: 100,
};

const DEFAULT_PATTERN_PRIORITY = 50;

// -----------------------------------------------------------------------------
// In-memory pattern cache (scalable: new DB rows picked up after TTL)
// -----------------------------------------------------------------------------

let patternCache: {
  patterns: CitationPatternRecord[];
  fetchedAt: number;
} | null = null;

// -----------------------------------------------------------------------------
// Supabase: load citation_patterns
// -----------------------------------------------------------------------------

function createPatternsSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Fetches active regex rows from `citation_patterns`.
 * Results are cached briefly so extraction stays fast on repeated calls.
 */
export async function loadCitationPatterns(options?: {
  jurisdiction?: string;
  skipCache?: boolean;
}): Promise<{
  patterns: CitationPatternRecord[];
  errors: CitationPatternError[];
}> {
  const errors: CitationPatternError[] = [];
  const now = Date.now();

  if (
    !options?.skipCache &&
    patternCache &&
    now - patternCache.fetchedAt < PATTERN_CACHE_TTL_MS
  ) {
    return { patterns: patternCache.patterns, errors };
  }

  const supabase = createPatternsSupabaseClient();
  if (!supabase) {
    throw new Error(
      "Citation extraction requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  let query = supabase
    .from("citation_patterns")
    .select(
      "id, pattern_name, regex, format_template, example, jurisdiction, created_at, updated_at"
    )
    .order("pattern_name", { ascending: true });

  if (options?.jurisdiction) {
    query = query.eq("jurisdiction", options.jurisdiction);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load citation_patterns: ${error.message}`);
  }

  const patterns: CitationPatternRecord[] = [];
  for (const row of data ?? []) {
    const patternName = String(row.pattern_name ?? "").trim();
    const regex = String(row.regex ?? "").trim();

    if (!patternName || !regex) {
      errors.push({
        patternName: patternName || "(unknown)",
        message: "Skipped row with empty pattern_name or regex",
      });
      continue;
    }

    patterns.push({
      id: String(row.id),
      pattern_name: patternName,
      regex,
      format_template: row.format_template ?? null,
      example: row.example ?? null,
      jurisdiction: String(row.jurisdiction ?? "India"),
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  patternCache = { patterns, fetchedAt: now };
  return { patterns, errors };
}

/** Clears the in-memory pattern cache (useful after seeding or admin updates). */
export function clearCitationPatternCache(): void {
  patternCache = null;
}

// -----------------------------------------------------------------------------
// Text preprocessing — stable indices back to original input
// -----------------------------------------------------------------------------

interface NormalizedTextSlice {
  /** Whitespace-collapsed text used for regex matching. */
  normalized: string;
  /** normalized[i] originates from original[toOriginal[i]]. */
  toOriginal: number[];
}

/**
 * Collapses line breaks and repeated spaces without changing the meaning of tokens.
 * Builds a map so match indices can be reported against the original string.
 */
function buildSearchableText(text: string): NormalizedTextSlice {
  const toOriginal: number[] = [];
  let normalized = "";

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === "\r" || ch === "\n") {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== " ") {
        toOriginal.push(i);
        normalized += " ";
      }
      if (ch === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      continue;
    }

    if (/\s/.test(ch)) {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== " ") {
        toOriginal.push(i);
        normalized += " ";
      }
      continue;
    }

    toOriginal.push(i);
    normalized += ch;
  }

  return { normalized, toOriginal };
}

/**
 * Rebuilds a searchable slice when spacing normalization only inserts spaces
 * (same non-space characters in order). Keeps match indices aligned with the original.
 */
function mergeSpacingIntoSlice(
  slice: NormalizedTextSlice,
  spaced: string
): NormalizedTextSlice {
  const src = slice.normalized;
  if (src === spaced) {
    return slice;
  }

  const toOriginal: number[] = [];
  let si = 0;

  for (let ni = 0; ni < spaced.length; ni += 1) {
    const ch = spaced[ni];

    if (ch === " ") {
      if (si < src.length && src[si] === " ") {
        toOriginal.push(slice.toOriginal[si] ?? 0);
        si += 1;
      } else {
        const anchor =
          si > 0
            ? (slice.toOriginal[si - 1] ?? slice.toOriginal[0] ?? 0)
            : (slice.toOriginal[0] ?? 0);
        toOriginal.push(anchor);
      }
      continue;
    }

    while (si < src.length && src[si] === " ") {
      si += 1;
    }

    if (si < src.length && src[si] === ch) {
      toOriginal.push(slice.toOriginal[si] ?? 0);
      si += 1;
    }
  }

  return { normalized: spaced, toOriginal };
}

/** Applies normalizeCitationSpacing and keeps the original-index map in sync. */
function applySpacingNormalization(slice: NormalizedTextSlice): NormalizedTextSlice {
  const spaced = normalizeCitationSpacing(slice.normalized);
  return spaced === slice.normalized ? slice : mergeSpacingIntoSlice(slice, spaced);
}

/**
 * Inserts a space between glued reporter tokens and page numbers (e.g. SCC123 → SCC 123).
 * Rebuilds the index map so match positions still map to the original input.
 */
function expandStuckTokenDigits(slice: NormalizedTextSlice): NormalizedTextSlice {
  const n = slice.normalized;
  if (!n) {
    return slice;
  }

  const parts: { text: string; origIndex: number }[] = [];
  // Skip "OnLine" so SCC OnLine court tokens are not merged (e.g. OnLineDel3456).
  const re = /(?<!OnLine)([A-Za-z]{2,})(\d+)/gi;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(n)) !== null) {
    const letters = match[1];
    if (/^online$/i.test(letters)) {
      if (re.lastIndex === match.index) {
        re.lastIndex = match.index + 1;
      }
      continue;
    }
    for (let i = last; i < match.index; i += 1) {
      parts.push({ text: n[i], origIndex: slice.toOriginal[i] });
    }

    const origAt = slice.toOriginal[match.index] ?? 0;
    for (const c of match[1]) {
      parts.push({ text: c, origIndex: origAt });
    }
    parts.push({ text: " ", origIndex: origAt });

    for (let j = 0; j < match[2].length; j += 1) {
      const idx = match.index + match[1].length + j;
      parts.push({
        text: match[2][j],
        origIndex: slice.toOriginal[idx] ?? origAt,
      });
    }

    last = match.index + match[0].length;
  }

  for (let i = last; i < n.length; i += 1) {
    parts.push({ text: n[i], origIndex: slice.toOriginal[i] });
  }

  return {
    normalized: parts.map((p) => p.text).join(""),
    toOriginal: parts.map((p) => p.origIndex),
  };
}

/** Maps a [start, end) range in normalized text to the original input indices. */
function mapNormalizedRangeToOriginal(
  slice: NormalizedTextSlice,
  start: number,
  end: number
): { startIndex: number; endIndex: number } {
  if (start >= end || slice.normalized.length === 0) {
    return { startIndex: 0, endIndex: 0 };
  }

  const clampedStart = Math.max(0, Math.min(start, slice.toOriginal.length - 1));
  const clampedEnd = Math.max(clampedStart + 1, Math.min(end, slice.toOriginal.length));

  const startIndex = slice.toOriginal[clampedStart] ?? 0;
  const lastOriginal = slice.toOriginal[clampedEnd - 1] ?? startIndex;

  return { startIndex, endIndex: lastOriginal + 1 };
}

/**
 * Fixes common Indian reporter spacing issues (e.g. "SCC123" → "SCC 123").
 * Deterministic, generic rules only — no citation-specific literals.
 * Safe to run on full searchable text before matching and on extracted cites.
 */
export function normalizeCitationSpacing(citation: string): string {
  if (!citation) {
    return "";
  }

  let s = citation.replace(/\s+/g, " ").trim();

  // Parenthetical years: (2004) not ( 2004 )
  s = s.replace(/\(\s*(\d{4})\s*\)/g, "($1)");

  // Compound reporter before letter↔digit splits (e.g. SCCOnLine → SCC OnLine)
  s = s.replace(/SCCOnLine/gi, "SCC OnLine");
  s = s.replace(/SCC\s+On\s+Line/gi, "SCC OnLine");

  // Year glued to reporter (2024SCC…, 2024AIR…)
  s = s.replace(/(\d{4})(?=(?:SCC|SCR|AIR|MANU|Cri))/gi, "$1 ");

  // Fully glued AIR block (AIR2024SC567)
  s = s.replace(
    /\bAIR(\d{4})([A-Za-z&]+)(\d+)\b/gi,
    (_, year, court, page) => `AIR ${year} ${court} ${page}`
  );

  // Volume glued to closing paren: (2004)6 → (2004) 6
  s = s.replace(/\)(\d+)/g, ") $1");

  // Reporter token glued to digits (SCC224, AIR2004 when not caught above)
  s = s.replace(
    /\b(SCC|SCR|AIR|MANU)(?=\d)/gi,
    (token) => `${token.toUpperCase()} `
  );

  // SCC volume-in-parentheses layouts
  s = s.replace(
    /\((\d{4})\)\s*(\d+)\s*SCC\s*(\d+)/gi,
    "($1) $2 SCC $3"
  );
  s = s.replace(
    /(\d{4})\s*\((\d+)\)\s*SCC\s*(\d+)/gi,
    "($1) $2 SCC $3"
  );
  s = s.replace(/(\d{4})\s+(\d+)\s+SCC\s+(\d+)/gi, "($1) $2 SCC $3");

  // SCC OnLine court and page
  s = s.replace(
    /(\d{4})\s+SCC\s+OnLine\s+([A-Za-z]+)\s*(\d+)/gi,
    "$1 SCC OnLine $2 $3"
  );
  s = s.replace(/OnLine\s*([A-Za-z]{2,})(\d+)/gi, "OnLine $1 $2");

  // Spaced AIR
  s = s.replace(
    /AIR\s*(\d{4})\s+([A-Za-z&]+)\s*(\d+)/gi,
    (_, year, court, page) => `AIR ${year} ${court} ${page}`
  );

  s = s.replace(/(\d{4})\s*SCR\s*(\d+)/gi, "$1 SCR $2");

  s = s.replace(/(\d{4})\s*Cri\.?\s*LJ\.?\s*(\d+)/gi, "$1 Cri LJ $2");

  s = s.replace(/\s*\/\s*/g, "/");

  return s.replace(/\s+/g, " ").trim();
}

/**
 * Trims, normalizes spacing, and strips trailing punctuation that is not part of the cite.
 */
export function cleanExtractedCitation(raw: string): string {
  if (!raw) {
    return "";
  }

  let cleaned = normalizeCitationSpacing(raw.trim());
  cleaned = cleaned.replace(/[.,;:!?]+$/, "").trim();

  return cleaned;
}

/**
 * Builds text for regex matching: collapse whitespace, normalize reporter spacing
 * (twice around token↔digit expansion), keep index map aligned with the original.
 */
function buildMatchableText(originalText: string): {
  matchableText: string;
  indexSlice: NormalizedTextSlice;
} {
  let slice = applySpacingNormalization(buildSearchableText(originalText));
  slice = expandStuckTokenDigits(slice);
  slice = applySpacingNormalization(slice);
  return { matchableText: slice.normalized, indexSlice: slice };
}

/**
 * Prepares document text the same way as {@link extractCitations} before regex.
 * Exported for unit tests (spacing + index map); patterns still come from Supabase.
 */
export function buildCitationMatchableText(originalText: string): {
  matchableText: string;
  indexSlice: NormalizedTextSlice;
} {
  return buildMatchableText(originalText);
}

/** Locates a regex match in the original document when spacing-normalized text differs. */
function findMatchSpanInOriginal(
  originalText: string,
  matchedText: string,
  hintStart: number
): { startIndex: number; endIndex: number } | null {
  const needle = matchedText.trim();
  if (!needle) {
    return null;
  }

  const direct = originalText.indexOf(needle, Math.max(0, hintStart - needle.length));
  if (direct !== -1) {
    return { startIndex: direct, endIndex: direct + needle.length };
  }

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexPattern = escaped.replace(/\s+/g, "\\s+");
  const flex = new RegExp(flexPattern, "i");
  const searchFrom = Math.max(0, hintStart - needle.length * 2);
  const window = originalText.slice(searchFrom);
  const flexMatch = flex.exec(window);

  if (flexMatch?.index !== undefined) {
    const startIndex = searchFrom + flexMatch.index;
    return { startIndex, endIndex: startIndex + flexMatch[0].length };
  }

  const anywhere = originalText.indexOf(needle);
  if (anywhere !== -1) {
    return { startIndex: anywhere, endIndex: anywhere + needle.length };
  }

  return null;
}

// -----------------------------------------------------------------------------
// Regex execution (PostgreSQL patterns → JavaScript RegExp)
// -----------------------------------------------------------------------------

interface RawMatch {
  citationText: string;
  patternName: string;
  startIndex: number;
  endIndex: number;
  priority: number;
}

/**
 * Converts Supabase/PostgreSQL regex (e.g. leading (?i)) into a JavaScript RegExp.
 * JS does not support inline (?i); case-insensitivity is applied via the "i" flag.
 */
export function preparePostgresRegexForJs(source: string): {
  cleanedRegex: string;
  flags: string;
} {
  let cleaned = source.trim();

  while (/^\(\?[a-z]+\)/i.test(cleaned)) {
    const mod = cleaned.match(/^\(\?([a-z]+)\)/i);
    if (!mod) {
      break;
    }
    cleaned = cleaned.slice(mod[0].length);
  }

  return { cleanedRegex: cleaned, flags: "gi" };
}

function compilePatternRegex(
  pattern: CitationPatternRecord
): { regex: RegExp; cleanedRegex: string } | null {
  const { cleanedRegex } = preparePostgresRegexForJs(pattern.regex);
  if (!cleanedRegex) {
    return null;
  }

  try {
    const regex = new RegExp(cleanedRegex, "gi");
    regex.lastIndex = 0;
    return { regex, cleanedRegex };
  } catch {
    return null;
  }
}

/**
 * Runs one DB pattern against matchable text; maps spans back to the original input.
 */
function extractMatchesForPattern(
  pattern: CitationPatternRecord,
  originalText: string,
  matchableText: string,
  indexSlice: NormalizedTextSlice
): { matches: RawMatch[]; error?: CitationPatternError } {
  const compiled = compilePatternRegex(pattern);
  if (!compiled) {
    return {
      matches: [],
      error: {
        patternName: pattern.pattern_name,
        message: "Invalid or unsupported regular expression",
      },
    };
  }

  const { regex } = compiled;
  const matches: RawMatch[] = [];
  const priority =
    PATTERN_PRIORITY[pattern.pattern_name] ?? DEFAULT_PATTERN_PRIORITY;

  regex.lastIndex = 0;
  let match: RegExpExecArray | null;

  const maxIterations = 10_000;
  let iterations = 0;
  const useIndexMap = matchableText === indexSlice.normalized;

  while ((match = regex.exec(matchableText)) !== null) {
    iterations += 1;
    if (iterations > maxIterations) {
      return {
        matches,
        error: {
          patternName: pattern.pattern_name,
          message: "Aborted: exceeded maximum match iterations",
        },
      };
    }

    const fullMatch = match[0];
    if (!fullMatch) {
      if (regex.lastIndex === match.index) {
        regex.lastIndex += 1;
      }
      continue;
    }

    const citationText = cleanExtractedCitation(fullMatch);
    if (!citationText) {
      if (regex.lastIndex === match.index) {
        regex.lastIndex += 1;
      }
      continue;
    }

    let startIndex = 0;
    let endIndex = 0;

    if (useIndexMap) {
      const mapped = mapNormalizedRangeToOriginal(
        indexSlice,
        match.index,
        match.index + fullMatch.length
      );
      startIndex = mapped.startIndex;
      endIndex = mapped.endIndex;
    } else {
      const hint =
        indexSlice.toOriginal[Math.min(match.index, indexSlice.toOriginal.length - 1)] ??
        0;
      const span = findMatchSpanInOriginal(originalText, fullMatch, hint);
      if (!span) {
        if (regex.lastIndex === match.index) {
          regex.lastIndex += 1;
        }
        continue;
      }
      startIndex = span.startIndex;
      endIndex = span.endIndex;
    }

    matches.push({
      citationText,
      patternName: pattern.pattern_name,
      startIndex,
      endIndex,
      priority,
    });

    if (regex.lastIndex === match.index) {
      regex.lastIndex += 1;
    }
  }

  regex.lastIndex = 0;
  return { matches };
}

// -----------------------------------------------------------------------------
// Overlap resolution & deduplication
// -----------------------------------------------------------------------------

function rangesOverlap(a: RawMatch, b: RawMatch): boolean {
  return a.startIndex < b.endIndex && b.startIndex < a.endIndex;
}

function resolveOverlappingMatches(matches: RawMatch[]): RawMatch[] {
  if (matches.length <= 1) {
    return matches;
  }

  const sorted = [...matches].sort((a, b) => {
    if (a.startIndex !== b.startIndex) {
      return a.startIndex - b.startIndex;
    }
    const lenA = a.endIndex - a.startIndex;
    const lenB = b.endIndex - b.startIndex;
    if (lenB !== lenA) {
      return lenB - lenA;
    }
    return b.priority - a.priority;
  });

  const kept: RawMatch[] = [];

  for (const candidate of sorted) {
    const conflictIndex = kept.findIndex((k) => rangesOverlap(k, candidate));
    if (conflictIndex === -1) {
      kept.push(candidate);
      continue;
    }

    const existing = kept[conflictIndex];
    const candidateBetter =
      candidate.priority > existing.priority ||
      (candidate.priority === existing.priority &&
        candidate.endIndex - candidate.startIndex >
          existing.endIndex - existing.startIndex);

    if (candidateBetter) {
      kept[conflictIndex] = candidate;
    }
  }

  return kept;
}

function deduplicationKey(match: RawMatch): string {
  const normalizedText = match.citationText
    .toLowerCase()
    .replace(/\s+/g, " ");
  return `${match.startIndex}:${normalizedText}`;
}

function deduplicateMatches(matches: RawMatch[]): RawMatch[] {
  const seen = new Set<string>();
  const unique: RawMatch[] = [];

  for (const match of matches) {
    const key = deduplicationKey(match);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(match);
  }

  return unique;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Extracts legal citations from raw LLM or document text.
 *
 * Pipeline:
 * 1. Load regex patterns from Supabase `citation_patterns` (cached).
 * 2. Collapse whitespace / line breaks; expand glued token+digit pairs.
 * 3. normalizeCitationSpacing() on searchable text before any regex runs.
 * 4. Convert each DB regex: strip (?i), compile with "gi", exec in a loop.
 * 5. Resolve overlaps, deduplicate, sort by appearance order.
 */
export async function extractCitations(
  text: string,
  options?: { jurisdiction?: string; skipCache?: boolean }
): Promise<ExtractedCitation[]> {
  if (text == null || typeof text !== "string") {
    throw new TypeError("extractCitations expects a string");
  }

  if (text.length === 0) {
    return [];
  }

  const extractedAt = new Date().toISOString();
  const { patterns, errors: loadErrors } = await loadCitationPatterns(options);

  if (patterns.length === 0) {
    if (loadErrors.length > 0) {
      console.error("[citation-extractor] No patterns available", loadErrors);
    }
    return [];
  }

  const originalText = text;
  const { matchableText, indexSlice } = buildMatchableText(originalText);

  const allMatches: RawMatch[] = [];
  const patternErrors: CitationPatternError[] = [...loadErrors];

  for (const pattern of patterns) {
    try {
      const { matches, error } = extractMatchesForPattern(
        pattern,
        originalText,
        matchableText,
        indexSlice
      );

      if (error) {
        patternErrors.push(error);
        console.warn(
          `[citation-extractor] Pattern "${pattern.pattern_name}": ${error.message}`
        );
      }

      allMatches.push(...matches);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      patternErrors.push({ patternName: pattern.pattern_name, message });
      console.warn(
        `[citation-extractor] Pattern "${pattern.pattern_name}" failed: ${message}`
      );
    }
  }

  if (patternErrors.length > 0 && allMatches.length === 0) {
    console.error("[citation-extractor] Extraction produced no matches", {
      patternErrors,
    });
  }

  const resolved = resolveOverlappingMatches(allMatches);
  const deduped = deduplicateMatches(resolved);

  deduped.sort((a, b) => {
    if (a.startIndex !== b.startIndex) {
      return a.startIndex - b.startIndex;
    }
    return a.endIndex - b.endIndex;
  });

  return deduped.map((m) => ({
    citationText: m.citationText,
    patternName: m.patternName,
    startIndex: m.startIndex,
    endIndex: m.endIndex,
    extractedAt,
  }));
}

/** Sample document used by `testCitationExtraction` (covers common Indian reporters). */
export const CITATION_EXTRACTION_SAMPLE_TEXT = `
The Court relied on AIR 2004 SC 3358, (2004) 6 SCC 224, and 2024 SCC OnLine SC 123.
Earlier authorities include (2023) 5 SCC123, 1995 SCR  646, MANU/MH/1234/2023, and 2023 Cri LJ 456.
In Brahmo Samaj Education Society v. State of West Bengal, Section 302 of IPC was discussed.
Duplicate cite: AIR 2004 SC 3358.
`.trim();

/**
 * Smoke-test helper: runs extraction on {@link CITATION_EXTRACTION_SAMPLE_TEXT}
 * and returns a structured report (safe to call from scripts or dev consoles).
 */
export async function testCitationExtraction(): Promise<CitationExtractionTestReport> {
  const started = Date.now();
  const warnings: string[] = [];
  const patternErrors: CitationPatternError[] = [];

  let patternsLoaded = 0;

  try {
    const { patterns, errors } = await loadCitationPatterns();
    patternsLoaded = patterns.length;
    patternErrors.push(...errors);

    const expectedTokens = ["SCC", "AIR", "SCC OnLine", "MANU", "Cri LJ", "SCR"];
    const sampleText = CITATION_EXTRACTION_SAMPLE_TEXT;

    const extractions = await extractCitations(sampleText);

    const foundReporters = extractions.map((e) => e.citationText.toUpperCase());
    for (const token of expectedTokens) {
      const found = foundReporters.some((c) => c.includes(token.toUpperCase()));
      if (!found) {
        warnings.push(
          `No extraction matched "${token}" — add or update a row in citation_patterns`
        );
      }
    }

    return {
      sampleText,
      extractions,
      extractionCount: extractions.length,
      patternsLoaded,
      patternErrors,
      durationMs: Date.now() - started,
      warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      sampleText: CITATION_EXTRACTION_SAMPLE_TEXT,
      extractions: [],
      extractionCount: 0,
      patternsLoaded,
      patternErrors: [{ patternName: "(loader)", message }],
      durationMs: Date.now() - started,
      warnings: [`Fatal: ${message}`],
    };
  }
}
