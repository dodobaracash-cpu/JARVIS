import type { EmbeddingProvider } from '@/lib/llm/types';

/** Fixed by the vector(1536) column in the schema. All providers must match. */
export const EMBEDDING_DIM = 1536;

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has', 'have', 'i',
  'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'were',
  'will', 'with', 'you', 'your', 'my', 'me',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Offline embedding via the hashing trick. It gives lexical-overlap retrieval —
 * enough to exercise the whole loop with no second API key — but it does not
 * capture paraphrase. Set EMBEDDING_PROVIDER=openai for real semantics.
 */
export class HashingEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'hashing';
  readonly dimensions = EMBEDDING_DIM;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array<number>(EMBEDDING_DIM).fill(0);
      const tokens = tokenize(text);
      for (const token of tokens) {
        const h = fnv1a(token);
        vector[h % EMBEDDING_DIM] += 1;
        // A second, sign-carrying slot reduces collision noise.
        vector[fnv1a(`#${token}`) % EMBEDDING_DIM] += h % 2 === 0 ? 0.5 : -0.5;
      }
      const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      return norm === 0 ? vector : vector.map((v) => v / norm);
    });
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dimensions = EMBEDDING_DIM;
  private apiKey: string;
  private model: string;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    this.apiKey = apiKey;
    this.model = opts.model ?? 'text-embedding-3-small';
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts, dimensions: EMBEDDING_DIM }),
    });
    if (!response.ok) {
      throw new Error(`embedding request failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as { data: { embedding: number[] }[] };
    return body.data.map((d) => d.embedding);
  }
}
