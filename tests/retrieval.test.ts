import { describe, expect, it } from 'vitest';
import { renderContext } from '@/lib/retrieval/context';
import { LIMITS, retrieveContext } from '@/lib/retrieval/retrieve';
import { createHarness, newConversation, say } from './helpers';

async function seedMemory(
  h: Awaited<ReturnType<typeof createHarness>>,
  content: string,
  extra: Partial<{ importance: number; confidence: number; source_type: 'explicit' | 'inferred' }> = {},
) {
  const [embedding] = await h.embedder.embed([content]);
  return h.store.createMemory({
    user_id: h.user.id,
    project_id: null,
    content,
    memory_type: 'context',
    importance: extra.importance ?? 3,
    confidence: extra.confidence ?? 0.9,
    source_type: extra.source_type ?? 'explicit',
    source_id: null,
    status: 'active',
    superseded_by: null,
    embedding,
    last_accessed_at: null,
  });
}

describe('retrieval', () => {
  it('returns a focused package rather than the whole database', async () => {
    const h = await createHarness();

    for (let i = 0; i < 20; i++) {
      await seedMemory(h, `Soccer practice runs on weekday number ${i} at the north field.`);
    }
    for (let i = 0; i < 6; i++) {
      await seedMemory(h, `Workforce Control agent cost controls note ${i}: Dex spending needs limits.`);
    }

    const pkg = await retrieveContext(h.deps, {
      userId: h.user.id,
      query: 'Workforce Control Dex spending cost limits',
    });

    expect(pkg.memories.length).toBeLessThanOrEqual(LIMITS.memories);
    expect(pkg.memories.every((m) => m.content.includes('Workforce Control'))).toBe(true);
  });

  it('never surfaces superseded records as current truth', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);

    await say(h, conversation, 'MarketMind is active.', {
      candidates: [
        {
          kind: 'memory',
          content: 'MarketMind is an active project.',
          importance: 4,
          confidence: 0.95,
          source_type: 'explicit',
        },
      ],
    });
    await say(h, conversation, 'MarketMind is dead.', {
      candidates: [
        {
          kind: 'memory',
          content: 'MarketMind has been moved to the graveyard.',
          supersedes: 'MarketMind is an active project.',
          importance: 4,
          confidence: 0.95,
          source_type: 'explicit',
        },
      ],
    });

    const pkg = await retrieveContext(h.deps, {
      userId: h.user.id,
      query: 'What is going on with MarketMind?',
    });

    expect(pkg.memories.map((m) => m.content)).toEqual([
      'MarketMind has been moved to the graveyard.',
    ]);
  });

  it('surfaces retired decisions only when the question is about changing your mind', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);

    await say(h, conversation, '$1 threshold.', {
      candidates: [
        {
          kind: 'decision',
          title: 'Dex approval threshold',
          decision: 'Any Dex task above $1 requires approval.',
          importance: 5,
          confidence: 0.98,
          source_type: 'explicit',
        },
      ],
    });
    await say(h, conversation, 'Make it $5.', {
      candidates: [
        {
          kind: 'decision',
          title: 'Dex approval threshold',
          decision: 'Any Dex task above $5 requires approval.',
          supersedes: 'Dex approval threshold',
          importance: 5,
          confidence: 0.98,
          source_type: 'explicit',
        },
      ],
    });

    const normal = await retrieveContext(h.deps, {
      userId: h.user.id,
      query: 'What is the Dex approval rule?',
    });
    expect(normal.supersededDecisions).toHaveLength(0);
    expect(normal.decisions[0].decision).toContain('$5');

    const historical = await retrieveContext(h.deps, {
      userId: h.user.id,
      query: 'What decisions have I changed my mind about?',
    });
    expect(historical.classification.intent).toBe('changed_decisions');
    expect(historical.supersededDecisions[0].decision).toContain('$1');
    expect(renderContext(historical)).toContain('SUPERSEDED DECISIONS');
  });

  it('labels provenance so the model can separate facts from inferences', async () => {
    const h = await createHarness();
    await seedMemory(h, 'Investment School should emphasise day trading.', { confidence: 0.97 });
    await seedMemory(h, 'Investment School appears to be a lower priority lately.', {
      source_type: 'inferred',
      confidence: 0.5,
    });

    const pkg = await retrieveContext(h.deps, {
      userId: h.user.id,
      query: 'Why is Investment School important?',
    });
    const rendered = renderContext(pkg);

    expect(rendered).toContain('(explicit, conf 0.97');
    expect(rendered).toContain('(inferred, conf 0.50');
  });

  it('says so plainly when nothing relevant is stored', async () => {
    const h = await createHarness();
    const pkg = await retrieveContext(h.deps, {
      userId: h.user.id,
      query: 'What did I decide about the boat?',
    });
    expect(renderContext(pkg)).toContain('NO STORED CONTEXT MATCHED THIS QUERY.');
  });
});
