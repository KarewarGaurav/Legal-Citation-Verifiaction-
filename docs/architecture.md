# Architecture — BRAHMO Citation Safety Engine

## Problem

Generic LLMs hallucinate Indian case citations and still cite repealed IPC/CrPC sections. Lawyers need a **deterministic safety layer** after the model responds—not another model judging citations.

## Two loops (never mixed)

```
Lawyer query ──► Section normalizer (deterministic)
                      │
                      ▼
                 LLM API (generative)
                      │
                      ▼
              Raw legal memo + citations
                      │
                      ▼
         Citation safety engine (deterministic)
         extract → pre-filter → IK verify → annotate
                      │
                      ▼
              Lawyer-facing verified output
```

The safety engine **never** calls the LLM. The LLM **never** calls the safety engine.

## Pipeline modules

| Stage | Module | Responsibility |
|-------|--------|----------------|
| 1 | `section-normalizer.ts` | Load `section_mappings` from Supabase; rewrite IPC/CrPC/IEA in **query and response** |
| 2 | `citation-extractor.ts` | Load `citation_patterns` from Supabase; regex scan AI output |
| 3 | `hallucination-detector.ts` | Rule engine: future year, impossible SCC volume, suspicious page, pre-modern year |
| 4 | `citation-verifier.ts` | Cache → Indian Kanoon search (parallel batch); map to VERIFIED / UNVERIFIED / REMOVED |
| 5 | `citation-annotator.ts` | Insert badges and strikethrough; build summary counts |
| 6 | `citation-safety-pipeline.ts` | Orchestrates stages; emits `PipelineProcessingMetrics` (timing, IK cost) |

## API routes (Next.js App Router)

| Route | Role |
|-------|------|
| `POST /api/llm` | Proxy to LLM or mock (matter-aware) |
| `POST /api/citation-check` | Full pipeline + verification report + optional session persist |
| `POST /api/normalize-sections` | Section normalizer only (smoke test) |
| `POST /api/indian-kanoon` | Direct IK proxy (debug) |

Secrets (`LLM_API_KEY`, `INDIAN_KANOON_API_KEY`) stay server-side.

## Database-driven extensibility

- **New citation format:** `INSERT` one row into `citation_patterns` — extractor picks it up after cache TTL (~5 min).
- **New section mapping:** `INSERT` into `section_mappings`.
- **Future US/other jurisdictions:** add verifier adapter; keep extractor pattern table per jurisdiction.

## Verification semantics

| Status | Meaning |
|--------|---------|
| VERIFIED | Found in Indian Kanoon (or cache) |
| CORRECTED | Exists but spacing/page/court code normalized vs IK match |
| UNVERIFIED | Valid format, not in IK — may be real but obscure |
| REMOVED | Pre-filter (impossible cite) or IK not found with reporter metadata |

## Frontend

- **Matter selector** — eight assessment matters; loads default query.
- **Side-by-side** — generic LLM vs annotated verified column.
- **Alerts** — per-citation status + section normalization panel.
- **Report** — totals, accuracy %, IK API calls and estimated ₹ cost.

## Session persistence (innovation)

`citation_sessions` stores pipeline JSON for sidebar history—useful for demo replay without re-running IK.

## Performance choices

- Parallel `verifyCitationBatch` (`Promise.all`) with per-request rate limiting in the verifier.
- In-memory caches for patterns and mappings (5-minute TTL).
- Supabase `verification_cache` avoids repeat IK charges.

## Testing

- `npm test` — extractor spacing, hallucination rules, section extraction regex.
- API smoke routes under `/api/test-*` for manual checks in development.
