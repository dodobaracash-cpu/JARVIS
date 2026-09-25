import { describe, expect, it } from 'vitest';
import { ask, createHarness, newConversation, say } from './helpers';

const WORKFORCE_TURN = {
  candidates: [
    {
      kind: 'project_update',
      name: 'Workforce Control',
      current_milestone: 'Department zoom',
      current_state: 'Implementing office navigation and reducing Dex costs',
      importance: 4,
      confidence: 0.95,
      source_type: 'explicit',
    },
    {
      kind: 'decision',
      title: 'Dex approval threshold',
      decision: 'Any estimated Dex task above $1 requires approval.',
      reasoning: 'Avoid unnecessary AI-agent costs from trivial tasks.',
      project: 'Workforce Control',
      importance: 5,
      confidence: 0.98,
      source_type: 'explicit',
    },
    {
      kind: 'task',
      title: 'Finish department zoom',
      project: 'Workforce Control',
      reason: 'Next milestone for Track',
      importance: 4,
      confidence: 0.9,
      source_type: 'explicit',
    },
    {
      kind: 'event',
      event_type: 'worked_on_project',
      title: 'Worked on Workforce Control',
      project: 'Workforce Control',
      importance: 3,
      confidence: 0.95,
      source_type: 'explicit',
    },
  ],
};

describe('the alpha memory loop', () => {
  it('turns one message into structured records and recalls them in a fresh conversation', async () => {
    const h = await createHarness();
    const first = await newConversation(h);

    const turn = await say(
      h,
      first,
      'Worked on Workforce Control today. We decided that any Dex task estimated above $1 needs approval before execution. Next I want to finish department zoom.',
      WORKFORCE_TURN,
    );

    expect(turn.run.status).toBe('succeeded');
    expect(turn.outcome?.written.map((w) => w.kind).sort()).toEqual([
      'decision',
      'event',
      'project_update',
      'task',
    ]);

    const project = await h.store.findProjectByName(h.user.id, 'Workforce Control');
    expect(project?.current_milestone).toBe('Department zoom');

    const tasks = await h.store.listTasks(h.user.id, { status: 'unfinished' });
    expect(tasks.map((t) => t.title)).toContain('Finish department zoom');
    expect(tasks[0].project_id).toBe(project!.id);

    // A brand new conversation — nothing in the message history — still answers
    // from stored memory.
    const fresh = await newConversation(h);
    await ask(h, fresh, 'What did we decide about Dex spending?');

    const context = h.llm.lastSystemPrompt;
    expect(context).toContain('Dex approval threshold');
    expect(context).toContain('above $1 requires approval');
    expect(context).toContain('Avoid unnecessary AI-agent costs');
  });

  it('assembles project state when asked where things were left off', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);
    await say(h, conversation, 'Worked on Workforce Control today.', WORKFORCE_TURN);

    const fresh = await newConversation(h);
    await ask(h, fresh, 'Where did I leave off with Workforce Control?');

    const context = h.llm.lastSystemPrompt;
    expect(context).toContain('QUERY INTENT: project_status');
    expect(context).toContain('FOCUS PROJECT: Workforce Control');
    expect(context).toContain('Milestone: Department zoom');
    expect(context).toContain('Finish department zoom');
    expect(context).toContain('[worked_on_project]');
  });

  it('records provenance back to the originating message', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);

    const turn = await say(h, conversation, 'Locking in the Dex rule.', {
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
          content: 'Cost control is the current priority for agent tooling.',
          memory_type: 'strategy',
          importance: 4,
          confidence: 0.9,
          source_type: 'explicit',
        },
      ],
    });

    const [decision] = await h.store.listDecisions(h.user.id, { status: 'active' });
    const [memory] = await h.store.listMemories(h.user.id, { status: 'active' });

    expect(decision.source_id).toBe(turn.userMessage.id);
    expect(decision.source_type).toBe('conversation');
    expect(memory.source_id).toBe(turn.userMessage.id);

    // The stored message is the traceable origin of both records.
    const origin = await h.store.getMessage(decision.source_id!);
    expect(origin?.content).toBe('Locking in the Dex rule.');
  });
});
