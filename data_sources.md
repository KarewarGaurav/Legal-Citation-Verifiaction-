# Data Sources

This document records all external and seeded data used by the BRAHMO Citation Safety Engine implementation.

## 1) Citation patterns

**Purpose:** extract legal citations from generated text.

**Source of truth:**
- BRAHMO assessment setup guide (provided in assignment)
- `supabase/seed.sql` inserts rows into `citation_patterns`

**Formats seeded:**
- SCC
- SCC OnLine
- AIR
- Cri LJ
- SCR
- MANU

## 2) Statute section mappings

**Purpose:** normalize old statute references in query/response.

**Source of truth:**
- BRAHMO assessment setup guide mappings
- `supabase/seed.sql` inserts rows into `section_mappings`

**Scope:**
- IPC -> BNS
- CrPC -> BNSS
- IEA -> BSA

## 3) Citation verification authority

**Purpose:** deterministic existence check for citations.

**Primary source:**
- Indian Kanoon API (`https://api.indiankanoon.org`)

**Usage in project:**
- Search-based verification through API routes/lib modules
- Results cached in `verification_cache` table to reduce repeated calls and cost

## 4) Demo scenario data

**Purpose:** reproducible demo behavior without live provider dependency.

**Source files:**
- `src/lib/legal-matters.ts` (8 assessment scenarios and default queries)
- `src/lib/mock-llm.ts` (deterministic mock generated outputs)

## 5) LLM provider data path (generic response only)

**Purpose:** produce initial draft legal response.

**Configured providers via `.env`:**
- OpenAI-compatible endpoint
- Gemini endpoint

If provider fails or key is absent, the app falls back to deterministic mock output.

## 6) Storage layer

**Database:**
- Supabase PostgreSQL

**Schema location:**
- `supabase/schema.sql`

**Tables used for this feature:**
- `citation_patterns`
- `section_mappings`
- `verification_cache`
- `citation_sessions`

## 7) Out-of-scope / not used

- Clinical data, patient records, or medical datasets
- AI-based citation truth classification
- Proprietary legal databases beyond Indian Kanoon for this assessment
