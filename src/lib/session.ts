import { getEmbedder, getLlm } from '@/lib/llm';
import { getStore } from '@/lib/store';
import type { JarvisDeps } from '@/lib/jarvis';
import type { Store } from '@/lib/store/store';
import type { Conversation, User } from '@/lib/types';

/**
 * v0.1 is single-user: there is one row in `users` and no auth. Supabase Auth
 * slots in here later without touching anything downstream.
 */
export async function getCurrentUser(store: Store = getStore()): Promise<User> {
  return store.ensureUser({
    name: process.env.JARVIS_USER_NAME ?? 'Cash',
    timezone: process.env.JARVIS_TIMEZONE ?? 'UTC',
  });
}

export async function getOrCreateConversation(
  store: Store,
  userId: string,
  conversationId?: string | null,
): Promise<Conversation> {
  if (conversationId) {
    const existing = await store.getConversation(conversationId);
    if (existing) return existing;
  }
  return store.createConversation({ user_id: userId });
}

export function getDeps(): JarvisDeps {
  return { store: getStore(), llm: getLlm(), embedder: getEmbedder() };
}
