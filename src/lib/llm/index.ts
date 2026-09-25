import { DemoProvider, isDemoMode } from '@/lib/demo';
import { AnthropicProvider } from '@/lib/llm/anthropic';
import { HashingEmbeddingProvider, OpenAIEmbeddingProvider } from '@/lib/llm/embeddings';
import type { EmbeddingProvider, LlmProvider } from '@/lib/llm/types';

export type { EmbeddingProvider, LlmProvider } from '@/lib/llm/types';

let llm: LlmProvider | null = null;
let embedder: EmbeddingProvider | null = null;

export function getLlm(): LlmProvider {
  if (llm) return llm;
  if (isDemoMode()) {
    llm = new DemoProvider();
    return llm;
  }
  const provider = process.env.LLM_PROVIDER ?? 'anthropic';
  switch (provider) {
    case 'anthropic':
      llm = new AnthropicProvider();
      return llm;
    default:
      throw new Error(`unknown LLM_PROVIDER: ${provider}`);
  }
}

export function getEmbedder(): EmbeddingProvider {
  if (embedder) return embedder;
  const provider = process.env.EMBEDDING_PROVIDER ?? 'hashing';
  embedder = provider === 'openai' ? new OpenAIEmbeddingProvider() : new HashingEmbeddingProvider();
  return embedder;
}

/** Test seam. */
export function setProviders(opts: { llm?: LlmProvider; embedder?: EmbeddingProvider }): void {
  if (opts.llm) llm = opts.llm;
  if (opts.embedder) embedder = opts.embedder;
}
