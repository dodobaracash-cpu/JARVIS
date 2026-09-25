import { describe, expect, it } from 'vitest';
import { createHarness, newConversation, say } from './helpers';

describe('reconciliation', () => {
  it('does not create duplicate canonical records when the same thing is said twice', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);

    const payload = {
      candidates: [
        {
          kind: 'decision',
          title: 'Dex approval threshold',
          decision: 'Any estimated Dex task above $1 requires approval.',
          importance: 5,
          confidence: 0.98,
          source_type: 'explicit',
        },
        {
          kind: 'memory',
          content: 'Dex agent costs are a recurring concern on Workforce Control.',
          memory_type: 'insight',
          importance: 4,
          confidence: 0.9,
          source_type: 'explicit',
        },
      ],
    };

    await say(h, conversation, 'Dex tasks over $1 need approval.', payload);
    const second = await say(h, conversation, 'Remember, Dex tasks over $1 need approval.', payload);

    expect(await h.store.listDecisions(h.user.id, { status: 'active' })).toHaveLength(1);
    expect(await h.store.listMemories(h.user.id, { status: 'active' })).toHaveLength(1);
    expect(second.outcome?.written.map((w) => w.action)).toEqual(['reconfirmed', 'reconfirmed']);
  });

  it('supersedes a memory the user has replaced, keeping the old one as history', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);

    await say(h, conversation, 'MarketMind is one of my active projects.', {
      candidates: [
        {
          kind: 'memory',
          content: 'MarketMind is an active project.',
          memory_type: 'context',
          importance: 4,
          confidence: 0.95,
          source_type: 'explicit',
        },
      ],
    });

    const moved = await say(h, conversation, 'MarketMind is dead, moving it to the graveyard.', {
      candidates: [
        {
          kind: 'memory',
          content: 'MarketMind has been moved to the graveyard and is no longer active.',
          memory_type: 'context',
          supersedes: 'MarketMind is an active project.',
          importance: 4,
          confidence: 0.95,
          source_type: 'explicit',
        },
      ],
    });

    const active = await h.store.listMemories(h.user.id, { status: 'active' });
    const superseded = await h.store.listMemories(h.user.id, { status: 'superseded' });

    expect(active).toHaveLength(1);
    expect(active[0].content).toContain('graveyard');
    expect(superseded).toHaveLength(1);
    expect(superseded[0].content).toBe('MarketMind is an active project.');
    expect(superseded[0].superseded_by).toBe(active[0].id);
    expect(moved.outcome?.written[0].action).toBe('superseded');
  });

  it('supersedes a reversed decision and can still show what changed', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);

    await say(h, conversation, 'Dex tasks above $1 need approval.', {
      candidates: [
        {
          kind: 'decision',
          title: 'Dex approval threshold',
          decision: 'Any estimated Dex task above $1 requires approval.',
          importance: 5,
          confidence: 0.98,
          source_type: 'explicit',
        },
      ],
    });

    await say(h, conversation, 'Actually raise the Dex threshold to $5.', {
      candidates: [
        {
          kind: 'decision',
          title: 'Dex approval threshold',
          decision: 'Any estimated Dex task above $5 requires approval.',
          reasoning: 'The $1 rule created too much approval friction.',
          supersedes: 'Dex approval threshold',
          importance: 5,
          confidence: 0.98,
          source_type: 'explicit',
        },
      ],
    });

    const active = await h.store.listDecisions(h.user.id, { status: 'active' });
    const superseded = await h.store.listDecisions(h.user.id, { status: 'superseded' });

    expect(active).toHaveLength(1);
    expect(active[0].decision).toContain('$5');
    expect(superseded).toHaveLength(1);
    expect(superseded[0].decision).toContain('$1');
    expect(superseded[0].superseded_by).toBe(active[0].id);
  });

  it('refuses to let an inference overwrite an explicitly stated fact', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);

    await say(h, conversation, 'I prefer concise, outcome-focused instructions when delegating.', {
      candidates: [
        {
          kind: 'profile_fact',
          category: 'work_preference',
          content: 'Prefers concise, outcome-focused instructions when delegating coding tasks.',
          importance: 4,
          confidence: 0.98,
          source_type: 'explicit',
        },
      ],
    });

    const inferred = await say(h, conversation, 'Wrote another long spec today.', {
      candidates: [
        {
          kind: 'profile_fact',
          category: 'work_preference',
          content: 'Prefers long, detailed instructions when delegating coding tasks.',
          importance: 4,
          confidence: 0.6,
          source_type: 'inferred',
        },
      ],
    });

    const facts = await h.store.listProfileFacts(h.user.id, { status: 'active' });
    expect(facts).toHaveLength(1);
    expect(facts[0].content).toContain('concise');
    expect(facts[0].source_type).toBe('explicit');
    expect(inferred.outcome?.rejected[0].reason).toContain('inference may not supersede');
  });

  it('keeps explicit and inferred facts distinguishable', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);

    await say(h, conversation, 'I work best late at night, and I keep choosing cost over speed.', {
      candidates: [
        {
          kind: 'profile_fact',
          category: 'schedule',
          content: 'Works best late at night.',
          importance: 3,
          confidence: 0.95,
          source_type: 'explicit',
        },
        {
          kind: 'profile_fact',
          category: 'decision_style',
          content: 'Tends to optimise for cost over speed.',
          importance: 3,
          confidence: 0.55,
          source_type: 'inferred',
        },
      ],
    });

    const facts = await h.store.listProfileFacts(h.user.id, { status: 'active' });
    const bySource = Object.fromEntries(facts.map((f) => [f.category, f.source_type]));
    expect(bySource).toEqual({ schedule: 'explicit', decision_style: 'inferred' });
  });

  it('rejects ephemeral, low-value candidates instead of storing them', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);

    const turn = await say(h, conversation, "I'm hungry.", {
      candidates: [
        {
          kind: 'memory',
          content: 'Cash is hungry right now.',
          memory_type: 'context',
          importance: 1,
          confidence: 0.9,
          source_type: 'explicit',
        },
      ],
      discarded: [{ summary: 'user is hungry', reason: 'ephemeral state' }],
    });

    expect(await h.store.listMemories(h.user.id, {})).toHaveLength(0);
    expect(turn.outcome?.rejected[0].reason).toContain('importance 1');
    expect(turn.run.rejected?.some((r) => r.reason === 'ephemeral state')).toBe(true);
  });

  it('resolves references to an existing project instead of forking a near-duplicate', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);

    await say(h, conversation, 'Started Workforce Control.', {
      candidates: [
        {
          kind: 'project_update',
          name: 'Workforce Control',
          current_objective: 'Turn Track into a functional management surface',
          importance: 4,
          confidence: 0.95,
          source_type: 'explicit',
        },
      ],
    });

    await say(h, conversation, 'workforce control got a new milestone today.', {
      candidates: [
        {
          kind: 'project_update',
          name: 'workforce control',
          current_milestone: 'Department zoom',
          importance: 4,
          confidence: 0.95,
          source_type: 'explicit',
        },
      ],
    });

    const projects = await h.store.listProjects(h.user.id);
    expect(projects).toHaveLength(1);
    expect(projects[0].current_objective).toBe('Turn Track into a functional management surface');
    expect(projects[0].current_milestone).toBe('Department zoom');
  });
});
