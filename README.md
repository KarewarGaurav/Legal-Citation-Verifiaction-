# BRAHMO Citation Safety Engine

Deterministic citation safety pipeline for Indian legal AI. The system checks LLM-generated legal citations using regex extraction + database mappings + Indian Kanoon verification, then annotates output for lawyers.

## What this project does

- Extracts citations from AI output across 6 Indian formats.
- Detects obvious hallucinations with deterministic rules.
- Verifies citations via Indian Kanoon API with Supabase cache.
- Normalizes legacy statutes (IPC/CrPC/IEA) to BNS/BNSS/BSA.
- Shows side-by-side output: generic AI vs verified/annotated response.

**Design rule:** citation verification is deterministic; no AI reasoning is used for verification decisions.

## Tech stack

- Next.js 15 + TypeScript
- Supabase (PostgreSQL)
- Indian Kanoon API
- OpenAI-compatible or Gemini API (optional; mock fallback supported)

## Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `LLM_PROVIDER` | Optional | `openai` or `gemini` (default behavior is OpenAI path) |
| `LLM_MODEL` | Recommended | e.g. `gpt-4o-mini` or `gemini-2.5-flash` |
| `LLM_API_KEY` | Optional | Provider API key; if missing/failing app falls back to deterministic mock |
| `INDIAN_KANOON_API_KEY` | Recommended | Required for live citation verification against IK |
| `NORMALIZATION_MODE` | Optional | `normalize_to_current_codes` (default) or `preserve_original` |
| `LLM_FALLBACK_MODELS` | Optional | Comma-separated provider fallback models |

> Do not commit `.env` to git.

### 3) Initialize database

Run these in Supabase SQL Editor:

1. `supabase/schema.sql`
2. `supabase/seed.sql`

Verification queries:

```sql
SELECT COUNT(*) FROM section_mappings;   -- expected: 30
SELECT COUNT(*) FROM citation_patterns;  -- expected: 6
```

## Run

### Development

```bash
npm run dev
```

Open `http://localhost:3000`.

### Production build

```bash
npm run build
npm start
```

### Tests

```bash
npm test
npm run lint
```

## API routes

| Route | Purpose |
|---|---|
| `POST /api/llm` | Generic response from configured provider (or deterministic mock fallback) |
| `POST /api/citation-check` | Full deterministic pipeline (extract → pre-filter → verify → annotate) |
| `POST /api/normalize-sections` | Section normalization check |
| `GET/POST /api/sessions` | Session list/create |
| `GET/DELETE /api/sessions/[id]` | Session load/delete |

## Demo flow for assessment

1. Pick a scenario chip (Scenario 1–8) from the query panel.
2. Click **Ask Generic AI** for raw output.
3. Click **Ask with Citation Verification** for annotated output.
4. Show report metrics: verified/corrected/removed, IK API calls, cost estimate, section alerts.

## Project structure

```text
src/app/api/            # API routes
src/components/         # UI components
src/hooks/              # Dashboard/session hooks
src/lib/                # Core pipeline modules
supabase/schema.sql     # DB schema
supabase/seed.sql       # 6 patterns + 30 mappings
docs/architecture.md    # Architecture notes
data_sources.md         # Data and source provenance
```

## Submission checklist

- [ ] Working demo app
- [ ] Repository link
- [ ] README with setup/run steps
- [ ] `data_sources.md`
- [ ] `docs/architecture.md`

## License

Private assessment repository.
