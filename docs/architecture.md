# Architecture Notes

## Objective

Protect legal users from fabricated/incorrect citations by placing a deterministic safety pipeline after LLM generation and before output presentation.

## High-level design

```text
User Query
  -> Normalize statute references (deterministic)
  -> Generate generic response (LLM provider or deterministic mock)
  -> Deterministic citation safety pipeline:
       extract -> pre-filter -> verify -> annotate
  -> Render verified output + report + alerts
```

### Separation of concerns

- **Generative layer:** only generates draft legal text.
- **Safety layer:** only validates and transforms citations/statute references using deterministic logic.
- These two layers are intentionally decoupled.

## Core modules

| Module | Responsibility |
|---|---|
| `src/lib/section-normalizer.ts` | Detect and normalize IPC/CrPC/IEA references using `section_mappings` |
| `src/lib/citation-extractor.ts` | Extract citations using DB-driven regex patterns |
| `src/lib/hallucination-detector.ts` | Rule-based pre-filter for impossible/suspicious citations |
| `src/lib/citation-verifier.ts` | Cache-first verification using Indian Kanoon API |
| `src/lib/citation-annotator.ts` | Annotate output with VERIFIED/CORRECTED/UNVERIFIED/REMOVED |
| `src/lib/citation-safety-pipeline.ts` | Stage orchestration and processing metrics |

## API contract

| Route | Purpose |
|---|---|
| `POST /api/llm` | Generic response from configured provider (OpenAI-compatible/Gemini) with mock fallback |
| `POST /api/citation-check` | Execute deterministic pipeline and return report payload |
| `POST /api/normalize-sections` | Section normalization endpoint (smoke/testing use) |
| `POST /api/indian-kanoon` | IK integration utility endpoint |
| `GET/POST /api/sessions` | Session persistence |
| `GET/DELETE /api/sessions/[id]` | Session retrieval/deletion |

## Data model and sources

Supabase tables used:
- `citation_patterns`
- `section_mappings`
- `verification_cache`
- `citation_sessions`

Schema and seed files:
- `supabase/schema.sql`
- `supabase/seed.sql`

## Deterministic verification semantics

| Status | Meaning |
|---|---|
| `VERIFIED` | Citation confirmed by IK (or cached confirmed result) |
| `CORRECTED` | Citation exists but required normalization/correction |
| `UNVERIFIED` | Could not confirm existence with available authority |
| `REMOVED` | Citation flagged as impossible or unreliable by deterministic checks |

## Reliability and performance decisions

- Cache-first verification to reduce API load and cost.
- Parallel verification execution for citation batches.
- Timeout-protected provider and IK calls.
- Graceful fallback to deterministic mock when provider is unavailable.
- Structured logging for provider errors and API response failures.

## Extensibility

- Add citation format: insert one row in `citation_patterns`.
- Add statute mapping: insert one row in `section_mappings`.
- Add new verifier authority: implement additional verifier adapter and route through pipeline.

## Current implementation notes

- UI uses scenario chips (8 scenarios) to load representative matter queries.
- Sessions are persisted and can be replayed for demos.
- Metrics include extraction/verification/annotation timings and IK usage/cost estimates.

## Testing strategy

- Unit tests focus on:
  - citation extraction normalization behavior
  - hallucination rules
  - section extraction logic
- Build + lint run before submission.
