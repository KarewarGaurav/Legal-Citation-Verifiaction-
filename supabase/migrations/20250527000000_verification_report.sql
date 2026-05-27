-- Add verification_report to existing citation_sessions (safe to re-run)
ALTER TABLE public.citation_sessions
  ADD COLUMN IF NOT EXISTS verification_report JSONB;

COMMENT ON COLUMN public.citation_sessions.verification_report IS
  'Full VerificationReport JSON for workspace session restore.';
