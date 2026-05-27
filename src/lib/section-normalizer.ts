import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  getNormalizationMode,
  isNormalizationEnabled,
  type NormalizationMode,
} from "@/lib/normalization-config";
import type {
  ExtractedLegalSection,
  SectionMappingRecord,
  SectionNormalizationAlert,
  SectionNormalizationResult,
  SectionNormalizationTestReport,
  SectionReplacement,
} from "@/lib/types";

// -----------------------------------------------------------------------------
// Post-2024 legal reform (BNS / BNSS / BSA)
// -----------------------------------------------------------------------------
// India replaced IPC→BNS, CrPC→BNSS, and IEA→BSA (effective July 2024).
// This module does NOT infer mappings — it applies rows from `section_mappings`
// so counsel see transparent, auditable updates tied to the database.

// -----------------------------------------------------------------------------
// Configuration — DB-driven mapping architecture
// -----------------------------------------------------------------------------
// Mappings live in Supabase (`section_mappings`), not in source code.
// New acts (e.g. future codes) are added by inserting rows; extraction regexes
// below are the only code change needed for new `old_act` abbreviations.

const MAPPING_CACHE_TTL_MS = 5 * 60 * 1000;

/** Acts we attempt to normalize (legacy codes). Already-modern acts are left as-is. */
const NORMALIZABLE_ACTS = new Set(["IPC", "CRPC", "IEA"]);

const ACT_ALIASES: Record<string, string> = {
  IPC: "IPC",
  CRPC: "CRPC",
  "CR.P.C": "CRPC",
  "CR.P.C.": "CRPC",
  IEA: "IEA",
};

// -----------------------------------------------------------------------------
// In-memory mapping cache
// -----------------------------------------------------------------------------

let mappingCache: {
  rows: SectionMappingRecord[];
  lookup: Map<string, SectionMappingRecord>;
  fetchedAt: number;
} | null = null;

/** Test-only override; bypasses Supabase when set. */
let mappingOverride: SectionMappingRecord[] | null = null;

export interface NormalizeSectionsOptions {
  /** When set, overrides NORMALIZATION_MODE for this call. */
  mode?: NormalizationMode;
  /** In-memory mappings (tests); skips Supabase when provided. */
  mappings?: SectionMappingRecord[];
  skipCache?: boolean;
}

/** @internal Tests — inject rows without Supabase. */
export function __setSectionMappingsForTests(
  rows: SectionMappingRecord[] | null
): void {
  mappingOverride = rows;
  mappingCache = null;
}

function buildLookupFromRows(
  rows: SectionMappingRecord[]
): Map<string, SectionMappingRecord> {
  const lookup = new Map<string, SectionMappingRecord>();
  for (const row of rows) {
    if (!row.old_act || !row.old_section) {
      continue;
    }
    lookup.set(mappingLookupKey(row.old_act, row.old_section), row);
  }
  return lookup;
}

// -----------------------------------------------------------------------------
// Supabase client (server-safe, no session persistence)
// -----------------------------------------------------------------------------

function createMappingsSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function canonicalAct(act: string): string {
  const trimmed = act.trim().replace(/\s+/g, "");
  const upper = trimmed.toUpperCase();
  return ACT_ALIASES[upper] ?? upper;
}

function mappingLookupKey(oldAct: string, oldSection: string): string {
  return `${canonicalAct(oldAct)}:${oldSection.trim().toUpperCase()}`;
}

// -----------------------------------------------------------------------------
// findSectionMappings — load `section_mappings` from Supabase
// -----------------------------------------------------------------------------

/**
 * Loads all section mapping rows and builds a deterministic lookup map.
 * Cached briefly so repeated normalizations stay fast.
 */
export async function findSectionMappings(options?: {
  skipCache?: boolean;
  mappings?: SectionMappingRecord[];
}): Promise<{
  rows: SectionMappingRecord[];
  lookup: Map<string, SectionMappingRecord>;
}> {
  const injected = options?.mappings ?? mappingOverride;
  if (injected) {
    const lookup = buildLookupFromRows(injected);
    return { rows: injected, lookup };
  }

  const now = Date.now();

  if (
    !options?.skipCache &&
    mappingCache &&
    now - mappingCache.fetchedAt < MAPPING_CACHE_TTL_MS
  ) {
    return { rows: mappingCache.rows, lookup: mappingCache.lookup };
  }

  const supabase = createMappingsSupabaseClient();
  if (!supabase) {
    throw new Error(
      "Section normalization requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  const { data, error } = await supabase
    .from("section_mappings")
    .select(
      "id, old_section, new_section, old_act, new_act, created_at, updated_at"
    )
    .order("old_act", { ascending: true })
    .order("old_section", { ascending: true });

  if (error) {
    throw new Error(`Failed to load section_mappings: ${error.message}`);
  }

  const rows: SectionMappingRecord[] = (data ?? []).map((row) => ({
    id: String(row.id),
    old_section: String(row.old_section ?? "").trim(),
    new_section: String(row.new_section ?? "").trim(),
    old_act: row.old_act ? String(row.old_act).trim() : null,
    new_act: row.new_act ? String(row.new_act).trim() : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const lookup = buildLookupFromRows(rows);

  mappingCache = { rows, lookup, fetchedAt: now };
  return { rows, lookup };
}

// -----------------------------------------------------------------------------
// extractLegalSections — deterministic span detection
// -----------------------------------------------------------------------------

const SECTION_NUMBER =
  String.raw`\d+(?:\s*\(\s*\d+\s*\)|\(\d+\))?[A-Za-z]?`;

const PREFIX_STANDARD =
  String.raw`(?:Section|Sections|Sec\.?|S\.)(?:\s*[:\-]?\s*)`;
const PREFIX_US = String.raw`(?:u\s*/\s*s|u\.s\.)(?:\s*[:\-]?\s*)`;
const PREFIX_UNDER = String.raw`(?:under\s+section)(?:\s*[:\-]?\s*)`;

const ACT_TOKEN = String.raw`(IPC|Cr\.?\s*P\.?\s*C\.?|IEA|BNS|BNSS|BSA)\b`;

/** Compound phrase: "Sections 420 and 406 IPC" */
const COMPOUND_SECTION_RE = new RegExp(
  String.raw`(${PREFIX_STANDARD})(${SECTION_NUMBER})\s+and\s+(${SECTION_NUMBER})\s+${ACT_TOKEN}`,
  "gi"
);

/** Single reference: "Section 420 IPC", "sec. 420 IPC", "u/s 302 IPC" */
const SINGLE_SECTION_RE = new RegExp(
  String.raw`(?:${PREFIX_STANDARD}|${PREFIX_US}|${PREFIX_UNDER})(${SECTION_NUMBER})\s+${ACT_TOKEN}`,
  "gi"
);

function normalizeActToken(raw: string): string {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  if (compact.includes("CRPC") || compact.includes("CR.P.C")) {
    return "CrPC";
  }
  if (compact === "IPC") {
    return "IPC";
  }
  if (compact === "IEA") {
    return "IEA";
  }
  if (compact === "BNS") {
    return "BNS";
  }
  if (compact === "BNSS") {
    return "BNSS";
  }
  if (compact === "BSA") {
    return "BSA";
  }
  return raw.trim();
}

function spansOverlap(
  a: { startIndex: number; endIndex: number },
  b: { startIndex: number; endIndex: number }
): boolean {
  return a.startIndex < b.endIndex && b.startIndex < a.endIndex;
}

/**
 * Detects Indian statute section references in free text.
 * Supports multiple formats, compound phrases, and flexible whitespace.
 */
export function extractLegalSections(text: string): ExtractedLegalSection[] {
  const extractions: ExtractedLegalSection[] = [];
  let groupCounter = 0;

  const addCompoundMatches = () => {
    COMPOUND_SECTION_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = COMPOUND_SECTION_RE.exec(text)) !== null) {
      const prefix = match[1] ?? "Sections ";
      const sectionA = (match[2] ?? "").replace(/\s+/g, "");
      const sectionB = (match[3] ?? "").replace(/\s+/g, "");
      const act = normalizeActToken(match[4] ?? "");
      const fullMatch = match[0];
      const startIndex = match.index;
      const endIndex = startIndex + fullMatch.length;
      const groupId = `compound-${groupCounter++}`;

      extractions.push(
        {
          sectionNumber: sectionA,
          act,
          fullMatch,
          startIndex,
          endIndex,
          prefix,
          groupId,
          groupIndex: 0,
        },
        {
          sectionNumber: sectionB,
          act,
          fullMatch,
          startIndex,
          endIndex,
          prefix,
          groupId,
          groupIndex: 1,
        }
      );
    }
  };

  const addSingleMatches = () => {
    SINGLE_SECTION_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SINGLE_SECTION_RE.exec(text)) !== null) {
      const fullMatch = match[0];
      const startIndex = match.index;
      const endIndex = startIndex + fullMatch.length;
      const sectionNumber = (match[1] ?? "").replace(/\s+/g, "");
      const act = normalizeActToken(match[2] ?? "");
      const prefixEnd = fullMatch.search(/\d/);
      const prefix =
        prefixEnd > 0 ? fullMatch.slice(0, prefixEnd) : "Section ";

      extractions.push({
        sectionNumber,
        act,
        fullMatch,
        startIndex,
        endIndex,
        prefix,
      });
    }
  };

  addCompoundMatches();
  addSingleMatches();

  extractions.sort((a, b) => a.startIndex - b.startIndex || b.endIndex - a.endIndex);

  const accepted: ExtractedLegalSection[] = [];
  for (const candidate of extractions) {
    const overlapsAccepted = accepted.some(
      (existing) =>
        spansOverlap(candidate, existing) &&
        (candidate.groupId === undefined ||
          existing.groupId === undefined ||
          candidate.groupId !== existing.groupId)
    );
    if (!overlapsAccepted) {
      accepted.push(candidate);
    }
  }

  const seenSpans = new Set<string>();
  const deduped: ExtractedLegalSection[] = [];
  for (const item of accepted) {
    const key = item.groupId
      ? `${item.groupId}:${item.sectionNumber}`
      : `${item.startIndex}:${item.endIndex}:${item.sectionNumber}:${item.act}`;
    if (seenSpans.has(key)) {
      continue;
    }
    seenSpans.add(key);
    deduped.push(item);
  }

  return deduped.sort((a, b) => a.startIndex - b.startIndex);
}

// -----------------------------------------------------------------------------
// generateSectionAlerts
// -----------------------------------------------------------------------------

/**
 * Builds INFO alerts for successful mappings and WARNING alerts when
 * no DB row exists (original text preserved).
 */
export function generateSectionAlerts(
  replacements: SectionReplacement[],
  unmapped: ExtractedLegalSection[]
): SectionNormalizationAlert[] {
  const alerts: SectionNormalizationAlert[] = replacements.map((r) => ({
    original: r.original,
    normalized: r.normalized,
    severity: "INFO" as const,
    message: `Mapped ${r.oldAct} section ${r.oldSection} to ${r.newAct} section ${r.newSection}`,
    oldAct: r.oldAct,
    oldSection: r.oldSection,
    newAct: r.newAct,
    newSection: r.newSection,
  }));

  for (const section of unmapped) {
    alerts.push({
      original: section.fullMatch,
      normalized: section.fullMatch,
      severity: "WARNING",
      message: `No mapping found for ${section.act} section ${section.sectionNumber}`,
    });
  }

  return alerts;
}

// -----------------------------------------------------------------------------
// Normalization helpers
// -----------------------------------------------------------------------------

interface ResolvedSection {
  extraction: ExtractedLegalSection;
  mapping: SectionMappingRecord | null;
  newSection: string;
  newAct: string;
}

function resolveSections(
  extractions: ExtractedLegalSection[],
  lookup: Map<string, SectionMappingRecord>
): { resolved: ResolvedSection[]; unmapped: ExtractedLegalSection[] } {
  const resolved: ResolvedSection[] = [];
  const unmapped: ExtractedLegalSection[] = [];

  for (const extraction of extractions) {
    const actKey = canonicalAct(extraction.act);
    if (!NORMALIZABLE_ACTS.has(actKey)) {
      continue;
    }

    const row = lookup.get(mappingLookupKey(extraction.act, extraction.sectionNumber));
    if (!row?.new_section || !row.new_act) {
      unmapped.push(extraction);
      resolved.push({
        extraction,
        mapping: null,
        newSection: extraction.sectionNumber,
        newAct: extraction.act,
      });
      continue;
    }

    resolved.push({
      extraction,
      mapping: row,
      newSection: row.new_section,
      newAct: row.new_act,
    });
  }

  return { resolved, unmapped };
}

function buildPhraseReplacement(
  fullMatch: string,
  prefix: string,
  sections: { old: string; new: string }[],
  oldAct: string,
  newAct: string
): { normalized: string; changed: boolean } {
  let normalized = fullMatch;
  let changed = false;

  for (const { old, new: replacement } of sections) {
    if (old !== replacement) {
      normalized = normalized.replace(old, replacement);
      changed = true;
    }
  }

  const actPattern = new RegExp(
    `\\b${oldAct.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i"
  );
  if (actPattern.test(normalized) && oldAct.toUpperCase() !== newAct.toUpperCase()) {
    normalized = normalized.replace(actPattern, newAct);
    changed = true;
  }

  if (!changed) {
    return { normalized: fullMatch, changed: false };
  }

  return { normalized, changed: true };
}

function buildReplacements(
  text: string,
  resolved: ResolvedSection[]
): { normalizedText: string; replacements: SectionReplacement[] } {
  const replacements: SectionReplacement[] = [];
  const groups = new Map<string, ResolvedSection[]>();
  const singles: ResolvedSection[] = [];

  for (const item of resolved) {
    if (item.extraction.groupId) {
      const list = groups.get(item.extraction.groupId) ?? [];
      list.push(item);
      groups.set(item.extraction.groupId, list);
    } else {
      singles.push(item);
    }
  }

  type PendingReplacement = {
    startIndex: number;
    endIndex: number;
    original: string;
    normalized: string;
    oldAct: string;
    newAct: string;
    oldSection: string;
    newSection: string;
  };

  const pending: PendingReplacement[] = [];

  for (const item of singles) {
    const { extraction, mapping, newSection, newAct } = item;
    if (!mapping) {
      continue;
    }

    const { normalized, changed } = buildPhraseReplacement(
      extraction.fullMatch,
      extraction.prefix,
      [{ old: extraction.sectionNumber, new: newSection }],
      extraction.act,
      newAct
    );

    if (!changed) {
      continue;
    }

    pending.push({
      startIndex: extraction.startIndex,
      endIndex: extraction.endIndex,
      original: extraction.fullMatch,
      normalized,
      oldAct: extraction.act,
      newAct,
      oldSection: extraction.sectionNumber,
      newSection,
    });
  }

  for (const [, groupItems] of groups) {
    const sorted = [...groupItems].sort(
      (a, b) => (a.extraction.groupIndex ?? 0) - (b.extraction.groupIndex ?? 0)
    );
    const first = sorted[0];
    if (!first) {
      continue;
    }

    const sectionPairs = sorted.map((item) => ({
      old: item.extraction.sectionNumber,
      new: item.newSection,
    }));

    const legacyInGroup = sorted.filter((item) =>
      NORMALIZABLE_ACTS.has(canonicalAct(item.extraction.act))
    );
    // Never partially normalize one phrase: every legacy section in the group must map.
    if (legacyInGroup.length > 0 && !legacyInGroup.every((item) => item.mapping)) {
      continue;
    }

    const anyMapped = sorted.some((item) => item.mapping !== null);
    if (!anyMapped) {
      continue;
    }

    const newAct = sorted.find((item) => item.mapping)?.newAct ?? first.extraction.act;
    const { normalized, changed } = buildPhraseReplacement(
      first.extraction.fullMatch,
      first.extraction.prefix,
      sectionPairs,
      first.extraction.act,
      newAct
    );

    if (!changed) {
      continue;
    }

    for (const item of sorted) {
      if (!item.mapping) {
        continue;
      }
      pending.push({
        startIndex: first.extraction.startIndex,
        endIndex: first.extraction.endIndex,
        original: first.extraction.fullMatch,
        normalized,
        oldAct: item.extraction.act,
        newAct: item.newAct,
        oldSection: item.extraction.sectionNumber,
        newSection: item.newSection,
      });
    }
  }

  pending.sort((a, b) => b.startIndex - a.startIndex);

  const appliedSpans = new Set<string>();
  let normalizedText = text;

  for (const item of pending) {
    const spanKey = `${item.startIndex}:${item.endIndex}`;
    if (appliedSpans.has(spanKey)) {
      continue;
    }
    appliedSpans.add(spanKey);

    const slice = normalizedText.slice(item.startIndex, item.endIndex);
    if (slice !== item.original) {
      continue;
    }

    normalizedText =
      normalizedText.slice(0, item.startIndex) +
      item.normalized +
      normalizedText.slice(item.endIndex);

    const spanReplacements = pending.filter(
      (p) => p.startIndex === item.startIndex && p.endIndex === item.endIndex
    );
    for (const spanItem of spanReplacements) {
      const alreadyLogged = replacements.some(
        (r) =>
          r.startIndex === spanItem.startIndex &&
          r.endIndex === spanItem.endIndex &&
          r.oldSection === spanItem.oldSection
      );
      if (!alreadyLogged) {
        replacements.push({
          original: spanItem.original,
          normalized: spanItem.normalized,
          startIndex: spanItem.startIndex,
          endIndex: spanItem.endIndex,
          oldAct: spanItem.oldAct,
          newAct: spanItem.newAct,
          oldSection: spanItem.oldSection,
          newSection: spanItem.newSection,
        });
      }
    }
  }

  replacements.sort((a, b) => a.startIndex - b.startIndex);
  return { normalizedText, replacements };
}

// -----------------------------------------------------------------------------
// Index helpers — offsets for downstream layers (citations, annotations)
// -----------------------------------------------------------------------------

/**
 * Maps a character index in pre-normalization text to the same logical position
 * in post-normalization text using applied replacement spans (monotonic deltas).
 */
export function remapIndexAfterReplacements(
  index: number,
  replacements: SectionReplacement[]
): number {
  let delta = 0;
  const ordered = [...replacements].sort((a, b) => a.startIndex - b.startIndex);

  for (const r of ordered) {
    if (r.startIndex >= index) {
      break;
    }
    const lengthDelta =
      r.normalized.length - (r.endIndex - r.startIndex);
    if (r.endIndex <= index) {
      delta += lengthDelta;
    } else if (r.startIndex < index && r.endIndex > index) {
      // Index fell inside a replaced span — anchor to start of normalized slice.
      return r.startIndex + delta;
    }
  }

  return index + delta;
}

// -----------------------------------------------------------------------------
// normalizeSections — main entry (deterministic, no LLM)
// -----------------------------------------------------------------------------

/**
 * Normalization flow:
 * 1. Read NORMALIZATION_MODE (default: normalize_to_current_codes)
 * 2. `extractLegalSections` finds legacy references in the text
 * 3. `findSectionMappings` loads IPC/CrPC/IEA → BNS/BNSS/BSA rows
 * 4. Whole phrases replace end → start (no partial compound updates)
 * 5. `generateSectionAlerts` records INFO/WARNING; unmapped spans stay verbatim
 */
/** Merges query + response normalization for a single pipeline report. */
export function mergeSectionNormalizations(
  queryNorm: SectionNormalizationResult,
  responseNorm: SectionNormalizationResult
): SectionNormalizationResult {
  return {
    originalText: queryNorm.originalText,
    normalizedText: queryNorm.normalizedText,
    replacements: [...queryNorm.replacements, ...responseNorm.replacements],
    alerts: [...queryNorm.alerts, ...responseNorm.alerts],
  };
}

export async function normalizeSections(
  text: string,
  options?: NormalizeSectionsOptions
): Promise<SectionNormalizationResult> {
  const originalText = text;
  const mode = options?.mode ?? getNormalizationMode();

  if (!isNormalizationEnabled(mode)) {
    return {
      originalText,
      normalizedText: originalText,
      replacements: [],
      alerts: [],
    };
  }

  const extractions = extractLegalSections(text);
  const { lookup } = await findSectionMappings({
    skipCache: options?.skipCache,
    mappings: options?.mappings,
  });
  const { resolved, unmapped } = resolveSections(extractions, lookup);
  const { normalizedText, replacements } = buildReplacements(text, resolved);
  const alerts = generateSectionAlerts(replacements, unmapped);

  return {
    originalText,
    normalizedText,
    replacements,
    alerts,
  };
}

// -----------------------------------------------------------------------------
// testSectionNormalization — smoke test
// -----------------------------------------------------------------------------

export const SECTION_NORMALIZATION_SAMPLE_TEXT =
  "Complaint under Section 420 IPC and Section 406 IPC along with anticipatory bail under Section 438 CrPC.";

export const SECTION_NORMALIZATION_EXPECTED_TEXT =
  "Complaint under Section 318 BNS and Section 316 BNS along with anticipatory bail under Section 482 BNSS.";

/**
 * Smoke-test helper: runs the assessment sample through `normalizeSections`.
 */
export async function testSectionNormalization(): Promise<SectionNormalizationTestReport> {
  const started = Date.now();
  const result = await normalizeSections(SECTION_NORMALIZATION_SAMPLE_TEXT);
  const passed = result.normalizedText === SECTION_NORMALIZATION_EXPECTED_TEXT;

  return {
    sampleText: SECTION_NORMALIZATION_SAMPLE_TEXT,
    expectedNormalizedText: SECTION_NORMALIZATION_EXPECTED_TEXT,
    result,
    passed,
    durationMs: Date.now() - started,
  };
}
