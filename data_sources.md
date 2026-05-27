# Data sources — BRAHMO Citation Safety Engine

This project verifies **Indian legal citations** and normalizes **post–July 2024 criminal code** section references. No clinical or patient data is used.

## Legal citation patterns (regex)

| Source | Use |
|--------|-----|
| BRAHMO assessment Setup Guide v2.0 | Six reporter regex patterns (SCC, SCC OnLine, AIR, Cri LJ, SCR, MANU) stored in Supabase `citation_patterns` |
| Project `supabase/seed.sql` | Canonical seed rows loaded into your Supabase project |

## Statute section mappings (IPC / CrPC / IEA → BNS / BNSS / BSA)

| Source | Use |
|--------|-----|
| BRAHMO assessment Setup Guide v2.0 | Thirty official mappings (effective after Bharatiya criminal law reforms, 1 July 2024) |
| Project `supabase/seed.sql` | Rows in `section_mappings` — add new mappings via SQL insert only (no code change) |

## Case law verification

| Source | URL / access | Use |
|--------|----------------|-----|
| Indian Kanoon API | https://api.indiankanoon.org | `POST /search/` to verify whether a citation exists; results cached in `verification_cache` |
| Signup / credits | https://api.indiankanoon.org/signup/ | Free tier (₹500 credit) sufficient for assessment |

## Sample legal matters & demo text

| Source | Use |
|--------|-----|
| BRAHMO assessment Setup Guide | Eight matters and four demo scenarios |
| `src/lib/legal-matters.ts` | Matter metadata and default queries |
| `src/lib/mock-llm.ts` | Offline deterministic AI responses aligned to demo scenarios |

## LLM responses (generic column)

| Provider | Config | Use |
|----------|--------|-----|
| OpenAI-compatible API | `LLM_API_KEY`, optional `LLM_API_BASE_URL`, `LLM_MODEL` | Live legal memos when configured |
| Mock fallback | `src/lib/mock-llm.ts` | Same queries always return the same text for demos without API cost |

## Application data storage

| Source | Use |
|--------|-----|
| Supabase PostgreSQL | `citation_patterns`, `section_mappings`, `verification_cache`, `citation_sessions` |
| Schema | `supabase/schema.sql` |

## What we do not use

- Patient records, EHR, or clinical trial data  
- Proprietary court databases beyond Indian Kanoon for this assessment  
- AI models to *verify* citations (verification is deterministic only)
