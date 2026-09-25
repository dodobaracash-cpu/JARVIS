import { describe, expect, it } from 'vitest';
import { replayFailedExtractions, runExtractionForMessage } from '@/lib/memory/pipeline';
import { createHarness, newConversation, say } from './helpers';

describe('extraction pipeline', () => {
  it('records a failure without losing the message, and replays it later', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);

    h.llm.failJson = true;
    const failed = await say(h, conversation, 'Decided to focus Investment School on day trading.');

    expect(failed.run.status).toBe('failed');
    expect(failed.run.error).toContain('provider unavailable');
    expect(failed.outcome).toBeNull();
    // The message survives, which is what makes the failure recoverable.
    expect(await h.store.getMessage(failed.userMessage.id)).not.toBeNull();

    h.llm.failJson = false;
    h.llm.jsonQueue.push({
      candidates: [
        {
          kind: 'decision',
          title: 'Investment School focus',
          decision: 'Investment School covers all investing with an emphasis on day trading.',
          importance: 5,
          confidence: 0.95,
          source_type: 'explicit',
        },
      ],
    });

    const replayed = await replayFailedExtractions(h.deps, h.user.id);
    expect(replayed[0].run.status).toBe('succeeded');
    const decisions = await h.store.listDecisions(h.user.id, { status: 'active' });
    expect(decisions[0].title).toBe('Investment School focus');
  });

  it('drops a malformed candidate without losing its valid siblings', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);

    const turn = await say(h, conversation, 'Two things happened.', {
      candidates: [
        { kind: 'decision', title: 'Missing the decision body', importance: 4, confidence: 0.9 },
        {
          kind: 'task',
          title: 'Finish department zoom',
          importance: 4,
          confidence: 0.9,
          source_type: 'explicit',
        },
      ],
    });

    expect(turn.run.status).toBe('succeeded');
    expect(turn.outcome?.written.map((w) => w.kind)).toEqual(['task']);
    expect(turn.run.rejected?.some((r) => r.reason.includes('schema validation failed'))).toBe(true);
  });

  it('writes nothing when a message holds nothing durable', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);

    const turn = await say(h, conversation, 'brb', { candidates: [] });

    expect(turn.run.status).toBe('succeeded');
    expect(turn.outcome?.written).toHaveLength(0);
    expect(await h.store.listMemories(h.user.id, {})).toHaveLength(0);
  });

  it('gives the extractor the entities it already knows so it can reuse their names', async () => {
    const h = await createHarness();
    const conversation = await newConversation(h);

    await say(h, conversation, 'Workforce Control exists.', {
      candidates: [
        {
          kind: 'project_update',
          name: 'Workforce Control',
          importance: 4,
          confidence: 0.95,
          source_type: 'explicit',
        },
      ],
    });

    const message = await h.store.addMessage({
      conversation_id: conversation.id,
      user_id: h.user.id,
      role: 'user',
      content: 'Made progress on it today.',
    });

    let seenPrompt = '';
    const originalJson = h.llm.json.bind(h.llm);
    h.llm.json = async (req) => {
      seenPrompt = req.messages[0].content;
      return originalJson(req);
    };

    await runExtractionForMessage(h.deps, { userId: h.user.id, messageId: message.id });
    expect(seenPrompt).toContain('KNOWN PROJECTS: Workforce Control');
    expect(seenPrompt).toContain('RECENT CONVERSATION:');
  });
});
