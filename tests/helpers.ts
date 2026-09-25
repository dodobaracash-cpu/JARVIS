import { respond } from '@/lib/jarvis';
import { HashingEmbeddingProvider } from '@/lib/llm/embeddings';
import type { ChatRequest, JsonRequest, LlmProvider } from '@/lib/llm/types';
import { runExtractionForMessage } from '@/lib/memory/pipeline';
import { InMemoryStore } from '@/lib/store/in-memory-store';
import type { Conversation, User } from '@/lib/types';

/**
 * A provider whose structured output is scripted per call, so every memory
 * behaviour can be asserted without a model in the loop.
 */
export class ScriptedLlm implements LlmProvider {
  readonly name = 'scripted';
  readonly model = 'scripted-test';

  jsonQueue: unknown[] = [];
  chatReply = 'Understood.';
  failJson = false;
  systemPrompts: string[] = [];
  chatRequests: ChatRequest[] = [];

  async chat(req: ChatRequest): Promise<string> {
    this.chatRequests.push(req);
    this.systemPrompts.push(req.system);
    return this.chatReply;
  }

  async json(_req: JsonRequest): Promise<unknown> {
    if (this.failJson) throw new Error('provider unavailable');
    return this.jsonQueue.shift() ?? { candidates: [] };
  }

  get lastSystemPrompt(): string {
    return this.systemPrompts[this.systemPrompts.length - 1] ?? '';
  }
}

export interface Harness {
  store: InMemoryStore;
  llm: ScriptedLlm;
  embedder: HashingEmbeddingProvider;
  user: User;
  deps: { store: InMemoryStore; llm: ScriptedLlm; embedder: HashingEmbeddingProvider };
}

export async function createHarness(): Promise<Harness> {
  const store = new InMemoryStore();
  const llm = new ScriptedLlm();
  const embedder = new HashingEmbeddingProvider();
  const user = await store.ensureUser({ name: 'Cash' });
  return { store, llm, embedder, user, deps: { store, llm, embedder } };
}

export async function newConversation(h: Harness): Promise<Conversation> {
  return h.store.createConversation({ user_id: h.user.id });
}

/**
 * One full turn: reply first, then the separate memory-writing pass over the
 * same message — the same order the API routes use.
 */
export async function say(
  h: Harness,
  conversation: Conversation,
  text: string,
  extraction?: unknown,
) {
  if (extraction !== undefined) h.llm.jsonQueue.push(extraction);
  const result = await respond(h.deps, {
    userId: h.user.id,
    conversationId: conversation.id,
    message: text,
  });
  const pipeline = await runExtractionForMessage(h.deps, {
    userId: h.user.id,
    messageId: result.userMessage.id,
  });
  return { ...result, ...pipeline };
}

/** Ask a question without writing anything to memory. */
export async function ask(h: Harness, conversation: Conversation, text: string) {
  return respond(h.deps, {
    userId: h.user.id,
    conversationId: conversation.id,
    message: text,
  });
}
