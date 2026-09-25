import { extractCandidates } from '@/lib/memory/extract';
import { writeCandidates, type WriteOutcome } from '@/lib/memory/writer';
import type { EmbeddingProvider, LlmProvider } from '@/lib/llm/types';
import type { Store } from '@/lib/store/store';
import type { ExtractionRun, Uuid } from '@/lib/types';

export interface PipelineDeps {
  store: Store;
  llm: LlmProvider;
  embedder: EmbeddingProvider;
}

export interface PipelineResult {
  run: ExtractionRun;
  outcome: WriteOutcome | null;
}

const RECENT_TURNS = 6;

/**
 * The memory-writing half of JARVIS. Deliberately separate from generating a
 * reply: the user gets an answer first, and nothing they say becomes permanent
 * truth until this has interpreted, reconciled and persisted it.
 */
export async function runExtractionForMessage(
  deps: PipelineDeps,
  params: { userId: Uuid; messageId: Uuid; now?: string },
): Promise<PipelineResult> {
  const { store, llm, embedder } = deps;
  const now = params.now ?? new Date().toISOString();

  const message = await store.getMessage(params.messageId);
  if (!message) throw new Error(`message ${params.messageId} not found`);

  const run = await store.createExtractionRun({
    user_id: params.userId,
    message_id: params.messageId,
    model: llm.model,
  });

  try {
    const [history, projects, goals, people, decisions] = await Promise.all([
      store.listMessages(message.conversation_id, RECENT_TURNS + 1),
      store.listProjects(params.userId, { limit: 40 }),
      store.listGoals(params.userId, { limit: 40 }),
      store.listPeople(params.userId, 40),
      store.listDecisions(params.userId, { status: 'active', limit: 20 }),
    ]);

    const extraction = await extractCandidates(llm, {
      message: message.content,
      recentTurns: history
        .filter((m) => m.id !== message.id)
        .slice(-RECENT_TURNS)
        .map((m) => ({ role: m.role, content: m.content })),
      knownProjects: projects.map((p) => p.name),
      knownGoals: goals.map((g) => g.title),
      knownPeople: people.map((p) => p.name),
      knownDecisions: decisions.map((d) => d.title),
      now,
    });

    const outcome = await writeCandidates(
      { store, embedder },
      {
        userId: params.userId,
        messageId: params.messageId,
        candidates: extraction.candidates,
        now,
      },
    );

    const finished = await store.finishExtractionRun(run.id, {
      status: 'succeeded',
      raw_output: extraction.raw,
      candidate_count: extraction.candidates.length,
      written_count: outcome.written.length,
      rejected: [
        ...outcome.rejected,
        ...extraction.discarded.map((d) => ({
          kind: 'discarded',
          summary: d.summary,
          reason: d.reason,
        })),
      ],
    });

    return { run: finished, outcome };
  } catch (error) {
    // The message itself is already stored, so a failure here is recoverable:
    // the run is left on record and can be replayed.
    const finished = await store.finishExtractionRun(run.id, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return { run: finished, outcome: null };
  }
}

/** Re-runs every failed extraction for a user. */
export async function replayFailedExtractions(
  deps: PipelineDeps,
  userId: Uuid,
  limit = 20,
): Promise<PipelineResult[]> {
  const failures = await deps.store.listExtractionRuns(userId, { status: 'failed', limit });
  const results: PipelineResult[] = [];
  for (const failure of failures) {
    results.push(await runExtractionForMessage(deps, { userId, messageId: failure.message_id }));
  }
  return results;
}
