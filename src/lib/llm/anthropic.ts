import Anthropic from '@anthropic-ai/sdk';
import type { ChatRequest, JsonRequest, LlmProvider } from '@/lib/llm/types';

export const DEFAULT_MODEL = 'claude-sonnet-5';

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private client: Anthropic;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    this.client = new Anthropic({ apiKey });
    this.model = opts.model ?? process.env.JARVIS_MODEL ?? DEFAULT_MODEL;
  }

  async chat(req: ChatRequest): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0.7,
      system: req.system,
      messages: req.messages,
    });
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
  }

  async json(req: JsonRequest): Promise<unknown> {
    // Tool use is the reliable way to get schema-shaped output back; the model
    // is forced to call the single tool we define.
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0,
      system: req.system,
      messages: req.messages,
      tools: [
        {
          name: req.toolName,
          description: req.description,
          input_schema: req.schema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: req.toolName },
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUse) throw new Error('model returned no structured output');
    return toolUse.input;
  }
}
