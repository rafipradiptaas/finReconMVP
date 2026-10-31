import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { LlmBlock, LlmImage, LlmMessage, LlmTool, TurnRequest, TurnResult } from '../types';

let client: Anthropic | undefined;
const anthropic = () => (client ??= new Anthropic());

function toResult(message: Anthropic.Message): TurnResult {
  const blocks = message.content.map((block): LlmBlock => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    if (block.type === 'tool_use') {
      return { type: 'tool_call', id: block.id, name: block.name, input: block.input };
    }
    return { type: 'opaque', data: block };
  });
  return {
    blocks,
    stopReason: message.stop_reason,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}

function toImageBlock({ mediaType, data }: LlmImage): Anthropic.ContentBlockParam {
  return mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}

function toBlockParam(block: LlmBlock): Anthropic.ContentBlockParam {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'tool_call':
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: block.toolCallId,
        content: block.content,
        is_error: block.isError,
      };
    case 'opaque':
      return block.data as Anthropic.ContentBlockParam;
  }
}

const toMessageParam = ({ role, content }: LlmMessage): Anthropic.MessageParam => ({
  role,
  content: typeof content === 'string' ? content : content.map(toBlockParam),
});

/** Structured outputs: the schema goes in output_config.format, not a forced tool (D19). */
export async function structuredTurn(
  request: TurnRequest & { input: string; images?: LlmImage[]; schema: z.ZodType },
): Promise<TurnResult> {
  const message = await anthropic().messages.create({
    model: request.model,
    max_tokens: request.maxTokens,
    system: request.system,
    output_config: { effort: request.effort, format: zodOutputFormat(request.schema) },
    messages: [
      {
        role: 'user',
        content: [
          ...(request.images ?? []).map(toImageBlock),
          { type: 'text', text: request.input },
        ],
      },
    ],
  });
  return toResult(message);
}

export async function toolTurn(
  request: TurnRequest & { messages: LlmMessage[]; tools: LlmTool[] },
): Promise<TurnResult> {
  const message = await anthropic().messages.create({
    model: request.model,
    max_tokens: request.maxTokens,
    system: request.system,
    output_config: { effort: request.effort },
    tools: request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: z.toJSONSchema(tool.inputSchema) as Anthropic.Tool.InputSchema,
    })),
    messages: request.messages.map(toMessageParam),
  });
  return toResult(message);
}

/** Stable code for llm_calls.error_code. */
export function providerErrorCode(error: unknown): string {
  return error instanceof Anthropic.APIError && error.status
    ? `http_${error.status}`
    : 'provider_error';
}
