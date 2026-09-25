import {
  candidateSchema,
  extractionJsonSchema,
  type Candidate,
  type ExtractionResult,
} from '@/lib/memory/candidates';
import type { LlmProvider } from '@/lib/llm/types';

export const EXTRACTION_SYSTEM_PROMPT = `You are the memory extraction stage of JARVIS, a persistent personal assistant.

You do not talk to the user. You read one user message (with a little surrounding conversation for context) and decide what deserves to be written into long-term memory as structured records.

What to extract:
- project_update — a project was mentioned, started, advanced, re-scoped, paused or killed.
- task — something the user intends to do.
- decision — a choice the user made, with reasoning if given. These matter most.
- event — something that happened, forming the user's timeline.
- profile_fact — a durable fact about the user (preferences, working style, constraints, identity).
- goal — an outcome the user is aiming at beyond a single task.
- person — someone in the user's life worth remembering.
- memory — durable context that does not fit the above cleanly.

Rules:
1. Do NOT extract ephemeral state. "I'm hungry", "I'm tired today", "brb" are not memories. Put them in "discarded" with a reason.
2. Set source_type="explicit" only when the user actually stated it. If you are inferring a pattern, set source_type="inferred" and lower the confidence. Never dress an inference up as a stated fact.
3. Set importance honestly: 5 = shapes identity, commitments or priorities; 3 = useful context; 1 = trivia. Anything at 1 should usually be discarded instead.
4. Reuse exact existing entity names when the message refers to something JARVIS already knows about. The known entities are listed below. Do not invent a near-duplicate name.
5. If the message contradicts or replaces something already known, still extract the new version and set "supersedes" to the old record's title or a short description of it.
6. One record per distinct fact. Do not restate the same thing as three different kinds.
7. If the message contains nothing durable, return an empty candidates array. That is a correct answer, not a failure.`;

export interface ExtractionContext {
  /** The message being extracted from. */
  message: string;
  /** A few preceding turns, oldest first, for pronoun and topic resolution. */
  recentTurns?: { role: 'user' | 'assistant'; content: string }[];
  knownProjects?: string[];
  knownGoals?: string[];
  knownPeople?: string[];
  knownDecisions?: string[];
  now?: string;
}

function renderContext(ctx: ExtractionContext): string {
  const lines: string[] = [];
  lines.push(`CURRENT TIME: ${ctx.now ?? new Date().toISOString()}`);
  if (ctx.knownProjects?.length) lines.push(`KNOWN PROJECTS: ${ctx.knownProjects.join(', ')}`);
  if (ctx.knownGoals?.length) lines.push(`KNOWN GOALS: ${ctx.knownGoals.join(', ')}`);
  if (ctx.knownPeople?.length) lines.push(`KNOWN PEOPLE: ${ctx.knownPeople.join(', ')}`);
  if (ctx.knownDecisions?.length) lines.push(`KNOWN DECISIONS: ${ctx.knownDecisions.join(', ')}`);
  if (ctx.recentTurns?.length) {
    lines.push('');
    lines.push('RECENT CONVERSATION:');
    for (const turn of ctx.recentTurns) {
      lines.push(`${turn.role === 'user' ? 'User' : 'JARVIS'}: ${turn.content}`);
    }
  }
  lines.push('');
  lines.push('MESSAGE TO EXTRACT FROM:');
  lines.push(ctx.message);
  return lines.join('\n');
}

export interface RawExtraction extends ExtractionResult {
  raw: unknown;
}

/**
 * Runs the extraction model call. Invalid candidates are demoted to `discarded`
 * rather than failing the run, so one malformed item cannot cost the others.
 */
export async function extractCandidates(
  llm: LlmProvider,
  ctx: ExtractionContext,
): Promise<RawExtraction> {
  const raw = await llm.json({
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: renderContext(ctx) }],
    toolName: 'record_memory_candidates',
    description: 'Return the structured records worth persisting from this message.',
    schema: extractionJsonSchema,
    temperature: 0,
    maxTokens: 2048,
  });

  const candidates: Candidate[] = [];
  const discarded: { summary: string; reason: string }[] = [];

  const payload = (raw ?? {}) as { candidates?: unknown; discarded?: unknown };
  const rawCandidates = Array.isArray(payload.candidates) ? payload.candidates : [];

  for (const item of rawCandidates) {
    const parsed = candidateSchema.safeParse(item);
    if (parsed.success) {
      candidates.push(parsed.data);
    } else {
      discarded.push({
        summary: JSON.stringify(item).slice(0, 200),
        reason: `schema validation failed: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      });
    }
  }

  if (Array.isArray(payload.discarded)) {
    for (const item of payload.discarded) {
      const entry = item as { summary?: unknown; reason?: unknown };
      if (typeof entry?.summary === 'string' && typeof entry?.reason === 'string') {
        discarded.push({ summary: entry.summary, reason: entry.reason });
      }
    }
  }

  return { candidates, discarded, raw };
}
