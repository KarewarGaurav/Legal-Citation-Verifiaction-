/**

 * Core domain types for BRAHMO Citation Safety Engine.

 * Business logic populates these structures at runtime.

 */



/** Row shape from `public.citation_patterns` (regex loaded at runtime, not hardcoded). */

export interface CitationPatternRecord {

  id: string;

  pattern_name: string;

  regex: string;

  format_template: string | null;

  example: string | null;

  jurisdiction: string;

  created_at?: string;

  updated_at?: string;

}



/**

 * Output of the citation extraction layer (pre-verification).

 * Indices refer to positions in the original input `text`.

 */

export interface ExtractedCitation {

  citationText: string;

  patternName: string;

  startIndex: number;

  endIndex: number;

  extractedAt: string;

}



/** Non-fatal issue while loading or applying a single pattern. */

export interface CitationPatternError {

  patternName: string;

  message: string;

}



export interface CitationExtractionTestReport {

  sampleText: string;

  extractions: ExtractedCitation[];

  extractionCount: number;

  patternsLoaded: number;

  patternErrors: CitationPatternError[];

  durationMs: number;

  warnings: string[];

}



export interface Citation {

  id: string;

  rawText: string;

  caseName?: string;

  court?: string;

  year?: number;

  reporter?: string;

  volume?: string;

  page?: string;

  section?: string;

  startOffset: number;

  endOffset: number;

}



export type VerificationStatus =

  | "verified"

  | "unverified"

  | "hallucinated"

  | "partial"

  | "pending";



export interface VerificationResult {

  citationId: string;

  citationText?: string;

  status: VerificationStatus;

  confidence: number;

  source?: CitationVerificationSource;

  sourceUrl?: string;

  sourceTitle?: string;

  notes?: string;

  checkedAt: string;

}



/** One row in the verification report citation list (deduplicated). */

export interface UniqueReportCitation {

  citationText: string;

  status: VerificationStatus;

  confidence: number;

  occurrenceCount: number;

  source?: CitationVerificationSource;

}



export interface SectionMapping {

  originalSection: string;

  normalizedSection: string;

  actOrStatute?: string;

  confidence: number;

}



/** Row shape from `public.section_mappings` (loaded at runtime for normalization). */

export interface SectionMappingRecord {

  id: string;

  old_section: string;

  new_section: string;

  old_act: string | null;

  new_act: string | null;

  created_at?: string;

  updated_at?: string;

}



/** One detected statute reference span in source text. */

export interface ExtractedLegalSection {

  sectionNumber: string;

  act: string;

  fullMatch: string;

  startIndex: number;

  endIndex: number;

  prefix: string;

  /** Shared id when multiple section numbers appear in one phrase (e.g. "Sections 420 and 406 IPC"). */

  groupId?: string;

  groupIndex?: number;

}



/** A single deterministic replacement applied during normalization. */

export interface SectionReplacement {

  original: string;

  normalized: string;

  startIndex: number;

  endIndex: number;

  oldAct: string;

  newAct: string;

  oldSection: string;

  newSection: string;

}



export type SectionNormalizationAlertSeverity = "INFO" | "WARNING";



/** User-facing alert for a normalized or unmapped section reference. */

export interface SectionNormalizationAlert {

  original: string;

  normalized: string;

  severity: SectionNormalizationAlertSeverity;

  message?: string;

  oldAct?: string;

  oldSection?: string;

  newAct?: string;

  newSection?: string;

}



/** Output of {@link normalizeSections}. */

export interface SectionNormalizationResult {

  originalText: string;

  normalizedText: string;

  replacements: SectionReplacement[];

  alerts: SectionNormalizationAlert[];

}



/** Smoke-test report from {@link testSectionNormalization}. */

export interface SectionNormalizationTestReport {

  sampleText: string;

  expectedNormalizedText: string;

  result: SectionNormalizationResult;

  passed: boolean;

  durationMs: number;

}



export interface VerificationReport {

  id: string;

  matterId: string;

  query: string;

  citations: Citation[];

  results: VerificationResult[];

  sectionMappings: SectionMapping[];

  summary: {

    totalCitations: number;

    verifiedCount: number;

    flaggedCount: number;

    hallucinationCount: number;

  };

  generatedAt: string;

}



export interface Matter {

  id: string;

  name: string;

  client?: string;

  description?: string;

}



/** Persisted dashboard snapshot for a citation session (excludes loading flags). */

export interface SessionDashboardSnapshot {

  genericResponse: string;

  verifiedResponse: string;

  verificationResults: VerificationResult[];

  sectionAlerts: SectionNormalizationAlert[];

  annotations: CitationAnnotation[];

  annotationSummary: CitationAnnotationSummary | null;

  processingMetrics: PipelineProcessingMetrics | null;

  report: VerificationReport | null;

  pipeline: CitationSafetyPipelineResult | null;

  usedMockFallback: boolean;

}



/** A citation research session in the workspace sidebar. */

export interface CitationSession {

  id: string;

  title: string;

  query: string;

  matterId: string;

  createdAt: string;

  updatedAt: string;

  responseSummary: string;

  dashboard: SessionDashboardSnapshot;

}



export interface ApiResponse<T> {

  success: boolean;

  data?: T;

  error?: string;

}



/** Stable identifiers for deterministic pre-verification hallucination rules. */

export type HallucinationRuleId =

  | "RULE_FUTURE_YEAR"

  | "RULE_IMPOSSIBLE_VOLUME"

  | "RULE_SUSPICIOUS_PAGE"

  | "RULE_PRE_MODERN";



/** Parsed fields from a citation string (when the format is recognized). */

export interface CitationExtractedMetadata {

  year?: number;

  volume?: number;

  page?: number;

  reporter?: string;

}



/** Result of {@link detectHallucinations} for a single citation string. */

export interface HallucinationDetectionResult {

  citationText: string;

  isHallucinated: boolean;

  isSuspicious: boolean;

  confidence: number;

  triggeredRules: HallucinationRuleId[];

  extractedMetadata: CitationExtractedMetadata;

}



/** One row in {@link HallucinationDetectionTestReport}. */

export interface HallucinationDetectionTestCase {

  citationText: string;

  result: HallucinationDetectionResult;

}



/** Smoke-test report from {@link testHallucinationDetection}. */

export interface HallucinationDetectionTestReport {

  cases: HallucinationDetectionTestCase[];

  passed: number;

  failed: number;

  durationMs: number;

}



/** Outcome of Indian Kanoon citation verification (matches DB enum). */

export type CitationVerificationStatus =

  | "VERIFIED"

  | "UNVERIFIED"

  | "REMOVED"

  | "CORRECTED";



/** Provenance of a {@link CitationVerificationResult}. */

export type CitationVerificationSource =

  | "CACHE"

  | "INDIAN_KANOON"

  | "HALLUCINATION_RULE";



/** Result of {@link verifyCitation} — deterministic, no LLM reasoning. */

export interface CitationVerificationResult {

  citationText: string;

  status: CitationVerificationStatus;

  source: CitationVerificationSource;

  verifiedAt: string;

  confidence: number;

  caseTitle?: string;

  ikDocId?: string;

  matchedCitation?: string;

  metadata?: Record<string, unknown>;

}



/** Row shape from `public.verification_cache`. */

export interface VerificationCacheRecord {

  id: string;

  citation_text: string;

  status: CitationVerificationStatus | null;

  verified_at: string | null;

  ik_doc_id: string | null;

  case_name: string | null;

  metadata: Record<string, unknown>;

  created_at?: string;

  updated_at?: string;

}



/** Single document entry in an Indian Kanoon search response. */

export interface IndianKanoonSearchDoc {

  tid: string;

  title?: string;

  headline?: string;

  docsource?: string;

  docsize?: number;

  citeList?: string[];

  [key: string]: unknown;

}



/** Parsed Indian Kanoon `/search/` JSON payload (subset used by the verifier). */

export interface IndianKanoonSearchResponse {

  found?: number;

  docs?: IndianKanoonSearchDoc[];

  encodedformInput?: string;

  formInput?: string;

  [key: string]: unknown;

}



/** One row in {@link CitationVerificationTestReport}. */

export interface CitationVerificationTestCase {

  citationText: string;

  result: CitationVerificationResult;

  expectedStatus: CitationVerificationStatus;

  expectedSource?: CitationVerificationSource;

}



/** Smoke-test report from {@link testCitationVerification}. */

export interface CitationVerificationTestReport {

  cases: CitationVerificationTestCase[];

  passed: number;

  failed: number;

  durationMs: number;

}



/** Visual annotation state for lawyer-facing citation highlights. */

export type CitationAnnotationState =

  | "VERIFIED"

  | "UNVERIFIED"

  | "REMOVED"

  | "CORRECTED";



/** One applied highlight span in annotated output (UI-agnostic; badge is pre-rendered). */

export interface CitationAnnotation {

  /** Deterministic id: `{start}:{end}:{state}:{occurrence}:{normalizedCitation}` */

  id: string;

  citationText: string;

  state: CitationAnnotationState;

  startIndex: number;

  endIndex: number;

  /** Pre-rendered markdown-safe replacement for the citation span. */

  badge: string;

  /** Full replacement string inserted at [startIndex, endIndex). */

  displayText: string;

  /** 0-based index among duplicate occurrences of the same citation string. */

  occurrenceIndex: number;

  verificationResult: CitationVerificationResult;

  matchedCitation?: string;

}



/** Aggregate counts for a single {@link annotateCitations} run. */

export interface CitationAnnotationSummary {

  total: number;

  verified: number;

  corrected: number;

  unverified: number;

  removed: number;

  /** Rounded percent of citations that are lawyer-safe (VERIFIED + CORRECTED). */

  accuracyPercentage: number;

}



/** Output of {@link annotateCitations}. */

export interface CitationAnnotationResult {

  annotatedText: string;

  annotations: CitationAnnotation[];

  summary: CitationAnnotationSummary;

}



/** Smoke-test report from {@link testCitationAnnotation}. */

export interface CitationAnnotationTestReport {

  sampleText: string;

  verificationResults: CitationVerificationResult[];

  result: CitationAnnotationResult;

  passed: boolean;

  durationMs: number;

  checks: string[];

}



/** Input to {@link runCitationSafetyPipeline}. */

export interface CitationSafetyPipelineInput {

  query: string;

  llmResponse: string;

}



/** Timing and count metrics for a single citation safety pipeline run. */

export interface PipelineProcessingMetrics {

  extractionMs: number;

  verificationMs: number;

  annotationMs: number;

  totalMs: number;

  citationCount: number;

  /** Citations removed by hallucination pre-filter (no IK call). */

  preFilterRemovedCount: number;

  /** Live Indian Kanoon search requests (excludes cache hits). */

  ikApiCalls: number;

  /** Estimated IK cost in INR (₹0.50 per search by default). */

  ikApiCostInr: number;

  /** Citations served from verification_cache. */

  cacheHits: number;

}



/** Output of {@link runCitationSafetyPipeline}. */

export interface CitationSafetyPipelineResult {

  originalQuery: string;

  normalizedQuery: string;

  originalResponse: string;

  /** LLM output after IPC/CrPC/IEA → BNS/BNSS/BSA normalization. */

  normalizedResponse: string;

  annotatedResponse: string;

  /** Citation badges on {@link normalizedResponse} (indices match normalized text). */

  annotations: CitationAnnotation[];

  extractedCitations: ExtractedCitation[];

  verificationResults: CitationVerificationResult[];

  sectionNormalization: SectionNormalizationResult;

  annotationSummary: CitationAnnotationSummary;

  processingMetrics: PipelineProcessingMetrics;

}



/** Smoke-test report from {@link testCitationSafetyPipeline}. */

export interface CitationSafetyPipelineTestReport {

  input: CitationSafetyPipelineInput;

  result: CitationSafetyPipelineResult;

  passed: boolean;

  durationMs: number;

  checks: string[];

}


