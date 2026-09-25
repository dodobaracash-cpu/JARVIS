import { InMemoryStore } from '@/lib/store/in-memory-store';
import type { ChatRequest, JsonRequest, LlmProvider } from '@/lib/llm/types';

/**
 * Demo mode exists so the UI can be clicked through with no Supabase project
 * and no API key. It is NOT a fallback: without JARVIS_DEMO=1 the real store
 * and provider are used and missing configuration fails loudly.
 */
export function isDemoMode(): boolean {
  return process.env.JARVIS_DEMO === '1';
}

// Each route gets its own module registry in dev, so the singleton has to hang
// off globalThis or /api/chat and /api/extract end up with separate stores.
const globalForDemo = globalThis as typeof globalThis & { __jarvisDemoStore?: InMemoryStore };

/** Lives for the process only; restarting the dev server clears it. */
export function getDemoStore(): InMemoryStore {
  if (!globalForDemo.__jarvisDemoStore) {
    globalForDemo.__jarvisDemoStore = new InMemoryStore({ clock: () => new Date().toISOString() });
  }
  return globalForDemo.__jarvisDemoStore;
}

/**
 * A stand-in model: replies by reporting the context it was given, and extracts
 * with crude keyword rules. Enough to exercise the plumbing, not the judgement.
 */
export class DemoProvider implements LlmProvider {
  readonly name = 'demo';
  readonly model = 'demo-stub';

  async chat(req: ChatRequest): Promise<string> {
    const contextBody = req.system.split('--- STORED CONTEXT (retrieved for this message only) ---')[1] ?? '';
    const lines = contextBody
      .split('\n')
      .filter((line) => line.startsWith('- '))
      .slice(0, 6);
    if (lines.length === 0) {
      return '[demo model] Nothing relevant is stored yet, so I have nothing to answer from. Set ANTHROPIC_API_KEY and turn off JARVIS_DEMO for real replies.';
    }
    return `[demo model] Answering from ${lines.length} retrieved records:\n${lines.join('\n')}`;
  }

  async json(req: JsonRequest): Promise<unknown> {
    const message = req.messages[0]?.content ?? '';
    const body = message.split('MESSAGE TO EXTRACT FROM:')[1]?.trim() ?? '';
    const candidates: Record<string, unknown>[] = [];

    if (/\b(decided|decision|we'll go with)\b/i.test(body)) {
      candidates.push({
        kind: 'decision',
        title: body.slice(0, 48),
        decision: body,
        importance: 4,
        confidence: 0.8,
        source_type: 'explicit',
      });
    }
    if (/\b(need to|want to|have to|next i)\b/i.test(body)) {
      candidates.push({
        kind: 'task',
        title: body.slice(0, 48),
        importance: 3,
        confidence: 0.8,
        source_type: 'explicit',
      });
    }
    if (candidates.length === 0 && body.length > 25) {
      candidates.push({
        kind: 'memory',
        content: body,
        memory_type: 'context',
        importance: 3,
        confidence: 0.7,
        source_type: 'explicit',
      });
    }
    return { candidates, discarded: [] };
  }
}
