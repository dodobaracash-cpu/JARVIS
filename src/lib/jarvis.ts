import { buildSystemPrompt } from '@/lib/prompt';
import { renderContext } from '@/lib/retrieval/context';
import { retrieveContext, type ContextPackage } from '@/lib/retrieval/retrieve';
import type { EmbeddingProvider, LlmProvider } from '@/lib/llm/types';
import type { Store } from '@/lib/store/store';
import type { Message, Uuid } from '@/lib/types';

export interface JarvisDeps {
  store: Store;
  llm: LlmProvider;
  embedder: EmbeddingProvider;
}

export interface RespondParams {
  userId: Uuid;
  conversationId: Uuid;
  message: string;
  now?: string;
}

export interface RespondResult {
  userMessage: Message;
  assistantMessage: Message;
  reply: string;
  context: ContextPackage;
  contextText: string;
}

const HISTORY_TURNS = 10;

/**
 * The read path: store the message, retrieve a focused context package, answer
 * from it. This never writes to long-term memory — that is the pipeline's job,
 * and it runs separately so a reply is never blocked behind a memory write.
 */
export async function respond(deps: JarvisDeps, params: RespondParams): Promise<RespondResult> {
  const { store, llm, embedder } = deps;
  const now = params.now ?? new Date().toISOString();
  const user = await store.getUser(params.userId);

  const userMessage = await store.addMessage({
    conversation_id: params.conversationId,
    user_id: params.userId,
    role: 'user',
    content: params.message,
  });

  const context = await retrieveContext(
    { store, embedder },
    { userId: params.userId, query: params.message, now },
  );
  const contextText = renderContext(context, { now });

  const history = await store.listMessages(params.conversationId, HISTORY_TURNS + 1);
  const reply = await llm.chat({
    system: buildSystemPrompt({ userName: user?.name ?? 'the user', context: contextText, now }),
    messages: history.map((m) => ({ role: m.role, content: m.content })),
    maxTokens: 1024,
  });

  const assistantMessage = await store.addMessage({
    conversation_id: params.conversationId,
    user_id: params.userId,
    role: 'assistant',
    content: reply,
  });

  return { userMessage, assistantMessage, reply, context, contextText };
}
