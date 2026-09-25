export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface JsonRequest extends ChatRequest {
  /** Name of the structured result the provider should return. */
  toolName: string;
  description: string;
  /** JSON Schema describing the expected object. */
  schema: Record<string, unknown>;
}

/**
 * Everything JARVIS needs from a model vendor. Swapping vendors means writing
 * one more implementation of this — no call site outside src/lib/llm changes.
 */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  chat(req: ChatRequest): Promise<string>;
  /** Structured extraction. Returns parsed JSON; the caller validates it. */
  json(req: JsonRequest): Promise<unknown>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}
