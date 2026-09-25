# JARVIS v0.1 — architecture note

## The loop

```
user message
   → respond()            read path: retrieve, then answer
   → runExtractionForMessage()   write path: extract, reconcile, persist
```

Those two halves never touch each other. `/api/chat` returns a reply and the
message id; the client then calls `/api/extract` with that id. A slow or failed
memory write cannot delay or break an answer, and nothing the user says becomes
permanent truth until the write path has interpreted and reconciled it.

## Read path

`retrieveContext()` is hybrid and deliberately small:

- **Structured** — `classifyQuery()` matches the query against known project and
  person names and a short list of intent patterns. That drives direct queries
  for the project record, its open tasks, its active decisions and its recent
  events. Rules, not a model call: fast, free, and testable.
- **Semantic** — the query is embedded and run through `match_memories()`
  (pgvector, cosine). Results are re-ranked as
  `0.55·similarity + 0.2·importance + 0.15·confidence + 0.1·recency`, filtered
  below a similarity floor, and capped.
- **Filtered** — superseded and non-active records are excluded in SQL, before
  ranking. The one exception is the `changed_decisions` intent, which is the
  only question that wants the retired versions.

Per-section caps live in `LIMITS`. The model receives a labelled text package,
never the database. Every line carries type, provenance and date, so the prompt
can require JARVIS to distinguish "you told me" from "I inferred".

## Write path

1. `extractCandidates()` — one structured model call, forced through a tool
   schema, with the user's known project/goal/person names supplied so the model
   reuses existing entity names instead of inventing near-duplicates.
2. Validation — each candidate is parsed with zod individually. A malformed one
   is demoted to `rejected` with its reason; its siblings still get written.
3. `writeCandidates()` — the reconciler:
   - **Entity resolution** — project names resolve to existing rows by exact
     match, then fuzzy title match, before a new row is created.
   - **Deduplication** — memories near-duplicate in embedding space
     (≥ 0.90 cosine) are *reconfirmed*, not re-stored: confidence and importance
     rise to the higher value. Decisions, tasks and goals dedupe by title.
   - **Supersession** — driven by the model's explicit `supersedes` hint, or by a
     decision reappearing under the same title with different content. The old
     row is kept, marked `superseded`, and pointed at the new one via
     `superseded_by`. That chain is what answers "what did I change my mind
     about".
   - **Value filter** — memories below importance 2 and anything below
     confidence 0.3 are rejected with a recorded reason.
   - **Trust rule** — an `inferred` fact may never supersede an `explicit` one;
     the attempt is rejected and logged. The reverse is allowed: hearing
     something stated outright upgrades an inference.
4. Everything is recorded on `extraction_runs` — raw model output, counts,
   rejections, errors. A failed run leaves the message intact and is replayable
   from `/memory` or `POST /api/extract {"replayFailed": true}`.

## Abstractions

`LlmProvider` (chat + structured JSON) and `EmbeddingProvider` are the only
places a vendor appears. `Store` is the only place the database appears — which
is what lets the test suite run the real reconciliation and retrieval logic
against an in-memory implementation, with no infrastructure.

## Tradeoffs and open risks

- **Embeddings default to a hashing trick.** Anthropic has no embeddings API, so
  rather than force a second vendor key the default provider hashes tokens into
  the 1536-dim space. It matches on lexical overlap, not meaning: "the agent
  costs too much" will not retrieve "Dex spending is out of control". Set
  `EMBEDDING_PROVIDER=openai` for real semantics. The column, the index and the
  interface are already sized for it.
- **Supersession is conservative.** It needs the model to say what a record
  replaces, or a decision title to repeat. Similarity alone does not trigger it,
  because two related memories are not a contradiction — the failure mode of
  over-eager supersession (silently retiring true records) is worse than the
  failure mode of under-eager (two records that both look current). Expect some
  stale records to need retiring by hand from `/memory`.
- **Writes are not transactional across records.** Supabase's PostgREST client
  has no multi-statement transaction; a mid-candidate crash can leave one record
  written and the next not. The run log makes this visible and replayable, and
  reconciliation is idempotent, so a replay converges. A Postgres function or a
  direct connection would close this properly.
- **Single user, no auth.** One row in `users`, service-role access, no session.
  `getCurrentUser()` is the seam where Supabase Auth goes.
- **Extraction costs one model call per user message**, and runs unconditionally
  even for "ok thanks". Batching or a cheap pre-filter is the obvious v0.2 win.
- **The conversation history in the prompt is the last 10 turns, untrimmed.**
  Long single conversations will grow the prompt independently of retrieval.
