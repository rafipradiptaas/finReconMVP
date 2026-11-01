import OpenAI from 'openai';
import { z } from 'zod';
import { DEEPSEEK } from '../config';
import { codeForStatus, MissingApiKeyError, type LlmErrorCode } from '../errors';
import type { LlmBlock, LlmImage, LlmMessage, LlmTool, TurnRequest, TurnResult } from '../types';

const STRUCTURED_TOOL = 'submit_result';

const clients = new Map<string, OpenAI>();

function client(baseURL: string) {
  const apiKey = process.env[DEEPSEEK.apiKeyEnv];
  if (!apiKey) throw new MissingApiKeyError(DEEPSEEK.apiKeyEnv);
  if (!clients.has(baseURL)) clients.set(baseURL, new OpenAI({ apiKey, baseURL }));
  return clients.get(baseURL)!;
}

/** The provider-neutral stop reasons that lib/llm/index.ts reads. */
const STOP_REASONS: Record<string, string> = {
  stop: 'end_turn',
  tool_calls: 'tool_use',
  length: 'max_tokens',
  content_filter: 'refusal',
};

function parseArguments(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Left for the tool's Zod schema to reject, which tells the model what went wrong.
    return undefined;
  }
}

function toResult(completion: OpenAI.ChatCompletion, blocks: LlmBlock[]): TurnResult {
  const finishReason = completion.choices[0]?.finish_reason ?? 'stop';
  return {
    blocks,
    stopReason: STOP_REASONS[finishReason] ?? finishReason,
    usage: {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    },
  };
}

type Message = OpenAI.ChatCompletionMessage & { reasoning_content?: string | null };

function toBlocks(message: Message): LlmBlock[] {
  const blocks: LlmBlock[] = [];
  if (message.reasoning_content) {
    blocks.push({ type: 'opaque', data: { reasoning_content: message.reasoning_content } });
  }
  if (message.content) blocks.push({ type: 'text', text: message.content });
  for (const call of message.tool_calls ?? []) {
    if (call.type !== 'function') continue;
    blocks.push({
      type: 'tool_call',
      id: call.id,
      name: call.function.name,
      input: parseArguments(call.function.arguments),
    });
  }
  return blocks;
}

function toAssistantMessage(blocks: LlmBlock[]) {
  const text = blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  const calls = blocks.flatMap((block) => (block.type === 'tool_call' ? [block] : []));
  const state = blocks.flatMap((block) => (block.type === 'opaque' ? [block.data as object] : []));
  return {
    role: 'assistant',
    content: text || null,
    // DeepSeek returns a 400 unless reasoning_content comes back on tool turns.
    ...Object.assign({}, ...state),
    ...(calls.length > 0 && {
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.input ?? null) },
      })),
    }),
  } as OpenAI.ChatCompletionAssistantMessageParam;
}

function toMessages({ role, content }: LlmMessage): OpenAI.ChatCompletionMessageParam[] {
  if (typeof content === 'string') return [{ role, content }];
  if (role === 'assistant') return [toAssistantMessage(content)];
  return content.flatMap((block): OpenAI.ChatCompletionMessageParam[] => {
    if (block.type === 'tool_result') {
      return [{ role: 'tool', tool_call_id: block.toolCallId, content: block.content }];
    }
    return block.type === 'text' ? [{ role: 'user', content: block.text }] : [];
  });
}

function jsonSchema(schema: z.ZodType) {
  const parameters: Record<string, unknown> = z.toJSONSchema(schema);
  delete parameters.$schema;
  return parameters;
}

type StructuredRequest = TurnRequest & { input: string; images?: LlmImage[]; schema: z.ZodType };

async function strictToolTurn(request: StructuredRequest): Promise<TurnResult> {
  const completion = await client(DEEPSEEK.betaBaseURL).chat.completions.create({
    model: request.model,
    max_tokens: request.maxTokens,
    // A named tool_choice returns 400 in thinking mode, which is the default.
    thinking: { type: 'disabled' },
    tool_choice: { type: 'function', function: { name: STRUCTURED_TOOL } },
    tools: [
      {
        type: 'function',
        function: {
          name: STRUCTURED_TOOL,
          description: 'Submit the result.',
          strict: true,
          parameters: jsonSchema(request.schema),
        },
      },
    ],
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.input },
    ],
  } as OpenAI.ChatCompletionCreateParamsNonStreaming);

  const call = completion.choices[0]?.message.tool_calls?.[0];
  const text = call?.type === 'function' ? call.function.arguments : '';
  return toResult(completion, [{ type: 'text', text }]);
}

async function jsonObjectTurn(request: StructuredRequest): Promise<TurnResult> {
  const schema = JSON.stringify(jsonSchema(request.schema));
  const completion = await client(DEEPSEEK.baseURL).chat.completions.create({
    model: request.model,
    max_tokens: request.maxTokens,
    reasoning_effort: request.effort,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `${request.system}\n\nReply with one JSON object that follows this JSON schema exactly:\n${schema}`,
      },
      { role: 'user', content: request.input },
    ],
  } as OpenAI.ChatCompletionCreateParamsNonStreaming);
  // Blank content happens here (documented) and fails JSON parsing, so it gets the normal retry.
  return toResult(completion, [
    { type: 'text', text: completion.choices[0]?.message.content ?? '' },
  ]);
}

export function structuredTurn(request: StructuredRequest): Promise<TurnResult> {
  if (request.images?.length) throw new Error('Vision goes through the anthropic adapter (D23)');
  return DEEPSEEK.structuredMethod === 'strict_tool'
    ? strictToolTurn(request)
    : jsonObjectTurn(request);
}

export async function toolTurn(
  request: TurnRequest & { messages: LlmMessage[]; tools: LlmTool[] },
): Promise<TurnResult> {
  const completion = await client(DEEPSEEK.baseURL).chat.completions.create({
    model: request.model,
    max_tokens: request.maxTokens,
    reasoning_effort: request.effort,
    tools: request.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: jsonSchema(tool.inputSchema),
      },
    })),
    messages: [
      { role: 'system', content: request.system },
      ...request.messages.flatMap(toMessages),
    ],
  } as OpenAI.ChatCompletionCreateParamsNonStreaming);
  const message = completion.choices[0]?.message;
  return toResult(completion, message ? toBlocks(message) : []);
}

/** Stable code for llm_calls.error_code. */
export function providerErrorCode(error: unknown): LlmErrorCode {
  if (error instanceof MissingApiKeyError) return 'missing_api_key';
  if (error instanceof OpenAI.APIConnectionError) return 'network_error';
  if (error instanceof OpenAI.APIError && error.status) return codeForStatus(error.status);
  return 'provider_error';
}
