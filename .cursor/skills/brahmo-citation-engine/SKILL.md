---
name: brahmo-citation-engine
description: Scaffolds and extends the BRAHMO Citation Safety Engine Next.js legal citation verification app. Use when working on citation extraction, verification, Indian Kanoon integration, Supabase matters schema, or dashboard API routes in this repository.
---

# BRAHMO Citation Safety Engine

## Architecture

Pipeline (implement in order):

1. `citation-extractor.ts` → `Citation[]`
2. `citation-verifier.ts` + `indian-kanoon` API → `VerificationResult[]`
3. `hallucination-detector.ts` → flag `hallucinated` / `unverified`
4. `section-normalizer.ts` → `SectionMapping[]`
5. `citation-annotator.ts` → highlight spans in verified response

API routes map to lib modules; keep secrets server-only (`LLM_API_KEY`, `INDIAN_KANOON_API_KEY`).

## Supabase

- Browser: `createClient()` in `src/lib/supabase.ts` (publishable key only).
- Enable RLS on all `public` tables before exposing via Data API.
- Never use `user_metadata` in RLS; use `app_metadata` for roles.

## Types

Single source: `src/lib/types.ts`. Re-export via `src/types/index.ts`.

## UI

Dashboard: `src/app/page.tsx`. Components are presentational until API wiring.

## Verification

After implementing a module, run a smoke test (unit test or `POST` to the route) before marking complete.
