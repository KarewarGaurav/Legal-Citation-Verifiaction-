-- =============================================================================
-- BRAHMO Citation Safety Engine — Supabase / PostgreSQL schema
-- Run in Supabase SQL Editor or: supabase db execute -f supabase/schema.sql
-- =============================================================================

-- Extensions (Supabase projects typically have these; safe to re-run)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enum: verification outcome for Indian Kanoon cache lookups
-- -----------------------------------------------------------------------------
CREATE TYPE public.verification_status AS ENUM (
  'VERIFIED',
  'UNVERIFIED',
  'REMOVED',
  'CORRECTED'
);

COMMENT ON TYPE public.verification_status IS
  'Outcome of a citation verification against Indian Kanoon or manual review.';

-- -----------------------------------------------------------------------------
-- Shared trigger: maintain updated_at on row change
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Sets updated_at to NOW() before INSERT/UPDATE on tables that include updated_at.';

-- -----------------------------------------------------------------------------
-- TABLE 1: citation_patterns — regex library for Indian legal citations
-- -----------------------------------------------------------------------------
CREATE TABLE public.citation_patterns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_name    TEXT NOT NULL,
  regex           TEXT NOT NULL,
  format_template TEXT,
  example         TEXT,
  jurisdiction    TEXT NOT NULL DEFAULT 'India',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT citation_patterns_pattern_name_unique UNIQUE (pattern_name),
  CONSTRAINT citation_patterns_regex_not_empty CHECK (length(trim(regex)) > 0)
);

COMMENT ON TABLE public.citation_patterns IS
  'Named regex patterns for extracting Indian case and statute citations from LLM or document text.';
COMMENT ON COLUMN public.citation_patterns.pattern_name IS
  'Stable identifier used by citation-extractor (e.g. air_reporter, scc_reporter).';
COMMENT ON COLUMN public.citation_patterns.regex IS
  'PostgreSQL-compatible regular expression (use (?i) for case-insensitive match).';
COMMENT ON COLUMN public.citation_patterns.format_template IS
  'Human-readable template describing capture groups, e.g. AIR {year} {court} {page}.';
COMMENT ON COLUMN public.citation_patterns.example IS
  'Canonical example string that must match the regex.';

CREATE INDEX idx_citation_patterns_jurisdiction
  ON public.citation_patterns (jurisdiction);

CREATE INDEX idx_citation_patterns_created_at
  ON public.citation_patterns (created_at DESC);

CREATE TRIGGER citation_patterns_set_updated_at
  BEFORE UPDATE ON public.citation_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- TABLE 2: section_mappings — IPC/BNS and CrPC/BNSS renumbering reference
-- -----------------------------------------------------------------------------
CREATE TABLE public.section_mappings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  old_section TEXT NOT NULL,
  new_section TEXT NOT NULL,
  old_act     TEXT,
  new_act     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT section_mappings_old_new_distinct CHECK (old_section IS DISTINCT FROM new_section),
  CONSTRAINT section_mappings_old_act_section_unique UNIQUE (old_act, old_section)
);

COMMENT ON TABLE public.section_mappings IS
  'Maps legacy statute section numbers (IPC, CrPC, IEA) to post–July 2024 codes (BNS, BNSS, BSA).';
COMMENT ON COLUMN public.section_mappings.old_section IS
  'Legacy section number or label (e.g. 302, 154, 3(5)).';
COMMENT ON COLUMN public.section_mappings.new_section IS
  'Equivalent section under the new code (e.g. 103, 173). Use repealed/deleted where applicable.';
COMMENT ON COLUMN public.section_mappings.old_act IS
  'Source statute abbreviation: IPC, CrPC, IEA, etc.';
COMMENT ON COLUMN public.section_mappings.new_act IS
  'Target statute abbreviation: BNS, BNSS, BSA, etc.';

CREATE INDEX idx_section_mappings_old_section
  ON public.section_mappings (old_section);

CREATE INDEX idx_section_mappings_new_section
  ON public.section_mappings (new_section);

CREATE INDEX idx_section_mappings_old_act_old_section
  ON public.section_mappings (old_act, old_section);

CREATE INDEX idx_section_mappings_new_act_new_section
  ON public.section_mappings (new_act, new_section);

CREATE TRIGGER section_mappings_set_updated_at
  BEFORE UPDATE ON public.section_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- TABLE 3: verification_cache — Indian Kanoon lookup cache
-- -----------------------------------------------------------------------------
CREATE TABLE public.verification_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citation_text TEXT NOT NULL,
  status        public.verification_status,
  verified_at   TIMESTAMPTZ,
  ik_doc_id     TEXT,
  case_name     TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT verification_cache_citation_text_unique UNIQUE (citation_text)
);

COMMENT ON TABLE public.verification_cache IS
  'Cache of citation verification results from Indian Kanoon to avoid repeat API calls.';
COMMENT ON COLUMN public.verification_cache.citation_text IS
  'Normalized citation string used as cache key (unique).';
COMMENT ON COLUMN public.verification_cache.status IS
  'Verification outcome; NULL until first lookup completes.';
COMMENT ON COLUMN public.verification_cache.ik_doc_id IS
  'Indian Kanoon document id when a match is found.';
COMMENT ON COLUMN public.verification_cache.metadata IS
  'Extra fields: court, year, reporter, confidence, source URL, correction notes, etc.';

CREATE INDEX idx_verification_cache_status
  ON public.verification_cache (status);

CREATE INDEX idx_verification_cache_verified_at
  ON public.verification_cache (verified_at DESC NULLS LAST);

CREATE INDEX idx_verification_cache_ik_doc_id
  ON public.verification_cache (ik_doc_id)
  WHERE ik_doc_id IS NOT NULL;

CREATE INDEX idx_verification_cache_metadata_gin
  ON public.verification_cache USING GIN (metadata);

CREATE INDEX idx_verification_cache_created_at
  ON public.verification_cache (created_at DESC);

CREATE TRIGGER verification_cache_set_updated_at
  BEFORE UPDATE ON public.verification_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- TABLE 4: citation_sessions — persistent workspace history for the sidebar
-- -----------------------------------------------------------------------------
CREATE TABLE public.citation_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 TEXT NOT NULL,
  query                 TEXT NOT NULL,
  normalized_query      TEXT,
  original_response     TEXT,
  annotated_response    TEXT,
  verification_summary  JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_results  JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_citations   JSONB NOT NULL DEFAULT '[]'::jsonb,
  section_alerts        JSONB NOT NULL DEFAULT '[]'::jsonb,
  processing_metrics    JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_report   JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT citation_sessions_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT citation_sessions_query_not_empty CHECK (length(trim(query)) > 0)
);

COMMENT ON TABLE public.citation_sessions IS
  'Persistent record of each citation safety pipeline run shown in the workspace sidebar history.';
COMMENT ON COLUMN public.citation_sessions.title IS
  'Human-readable session title (auto-generated from query when not provided).';
COMMENT ON COLUMN public.citation_sessions.verification_summary IS
  'CitationAnnotationSummary (total/verified/corrected/unverified/removed/accuracyPercentage).';
COMMENT ON COLUMN public.citation_sessions.verification_results IS
  'Array of VerificationResult rows used by the dashboard alerts and report.';
COMMENT ON COLUMN public.citation_sessions.extracted_citations IS
  'Citation[] spans returned from the extractor (offsets relative to original_response).';
COMMENT ON COLUMN public.citation_sessions.section_alerts IS
  'SectionNormalizationAlert[] from section-normalizer.';
COMMENT ON COLUMN public.citation_sessions.processing_metrics IS
  'PipelineProcessingMetrics (extractionMs/verificationMs/annotationMs/totalMs/citationCount).';
COMMENT ON COLUMN public.citation_sessions.verification_report IS
  'Full VerificationReport JSON for sidebar restore (query, citations, results, summary).';

-- Assessment alias: `legal_sessions` maps to this table (generic_response=original_response, verified_response=annotated_response).
-- ALTER TABLE public.citation_sessions RENAME TO legal_sessions;  -- optional, not applied by default

CREATE INDEX idx_citation_sessions_created_at
  ON public.citation_sessions (created_at DESC);

CREATE INDEX idx_citation_sessions_updated_at
  ON public.citation_sessions (updated_at DESC);

CREATE TRIGGER citation_sessions_set_updated_at
  BEFORE UPDATE ON public.citation_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security (required before exposing via Supabase Data API)
-- -----------------------------------------------------------------------------
ALTER TABLE public.citation_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citation_sessions ENABLE ROW LEVEL SECURITY;

-- Permissive development policies — replace with auth-scoped policies in production
CREATE POLICY "dev_citation_patterns_select"
  ON public.citation_patterns FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "dev_citation_patterns_insert"
  ON public.citation_patterns FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "dev_citation_patterns_update"
  ON public.citation_patterns FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "dev_citation_patterns_delete"
  ON public.citation_patterns FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "dev_section_mappings_select"
  ON public.section_mappings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "dev_section_mappings_insert"
  ON public.section_mappings FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "dev_section_mappings_update"
  ON public.section_mappings FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "dev_section_mappings_delete"
  ON public.section_mappings FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "dev_verification_cache_select"
  ON public.verification_cache FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "dev_verification_cache_insert"
  ON public.verification_cache FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "dev_verification_cache_update"
  ON public.verification_cache FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "dev_verification_cache_delete"
  ON public.verification_cache FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "dev_citation_sessions_select"
  ON public.citation_sessions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "dev_citation_sessions_insert"
  ON public.citation_sessions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "dev_citation_sessions_update"
  ON public.citation_sessions FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "dev_citation_sessions_delete"
  ON public.citation_sessions FOR DELETE
  TO anon, authenticated
  USING (true);
