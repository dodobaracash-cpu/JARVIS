# JARVIS v0.1 — persistent personal memory

The Alpha milestone: you tell JARVIS what is happening, it answers normally, and
separately decides what is worth remembering. A later conversation — with no
shared message history — can still answer from what was stored.

## Setup

1. **Create a Supabase project** and run the migration. Either paste
   `supabase/migrations/0001_init.sql` into the SQL editor, or with the CLI:

   ```bash
   supabase db push
   ```

   The migration enables `pgvector` and creates the schema, the `match_memories`
   search function, and row level security.

2. **Configure the environment.**

   ```bash
   cp .env.example .env.local
   ```

   Fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY`.
   Everything else has a working default.

3. **Install and run.**

   ```bash
   npm install
   npm run dev
   ```

   Chat is at `/`, and everything JARVIS believes is at `/memory`.

## Demo mode

`.env.local` ships with `JARVIS_DEMO=1`, which runs the app with no database
and no API key: storage is in-memory and the "model" is a keyword stub. It is
there so you can click through the UI immediately — the replies are not real
reasoning. Delete that line once your credentials are in place.

## Tests

```bash
npm test
```

The suite runs against an in-memory implementation of the same `Store`
interface the app uses, with a scripted model provider. No database, no network,
no API key — the memory behaviour is asserted deterministically.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side database access. Never ship to the browser. |
| `ANTHROPIC_API_KEY` | yes | Model calls |
| `LLM_PROVIDER` | no | `anthropic` (default) |
| `JARVIS_MODEL` | no | Defaults to `claude-sonnet-5` |
| `EMBEDDING_PROVIDER` | no | `hashing` (default, offline) or `openai` |
| `OPENAI_API_KEY` | only for `openai` embeddings | Embedding calls |
| `JARVIS_USER_NAME` | no | Names the single user row. Defaults to `Cash`. |
| `JARVIS_TIMEZONE` | no | Defaults to `UTC` |

## Where things live

```
supabase/migrations/   schema, vector index, match_memories()
src/lib/llm/           provider abstraction (chat, structured JSON, embeddings)
src/lib/store/         Store interface + Supabase and in-memory implementations
src/lib/memory/        extraction → validation → reconciliation → write
src/lib/retrieval/     query classification, hybrid retrieval, context builder
src/lib/prompt.ts      the JARVIS system prompt
src/app/               chat UI, memory inspector, API routes
tests/                 deterministic memory-behaviour suite
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit and what
was deliberately traded away.
