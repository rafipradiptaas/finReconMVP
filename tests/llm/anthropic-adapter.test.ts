import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const create = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', async (original) => {
  const actual = await original<typeof import('@anthropic-ai/sdk')>();
  class Mock extends actual.default {
    override messages = { create } as never;
  }
  return { ...actual, default: Mock };
});

const { structuredTurn, toolTurn } = await import('@/lib/llm/providers/anthropic');
const { invoiceExtractionSchema } = await import('@/lib/llm/schemas/invoice');

const settings = { model: 'm', effort: 'high', maxTokens: 100, system: 's' } as const;
const reply = {
  content: [{ type: 'text', text: '{}' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 3, output_tokens: 4 },
};

type Json = Record<string, unknown>;

function walk(node: unknown, visit: (object: Json) => void) {
  if (Array.isArray(node)) node.forEach((item) => walk(item, visit));
  else if (node && typeof node === 'object') {
    visit(node as Json);
    Object.values(node).forEach((value) => walk(value, visit));
  }
}

async function sentSchema() {
  create.mockResolvedValue(reply);
  await structuredTurn({ ...settings, input: 'i', schema: invoiceExtractionSchema });
  return create.mock.calls[0][0].output_config.format.schema as Json;
}

beforeEach(() => create.mockReset());

describe('structuredTurn', () => {
  it('uses output_config.format and never forces a tool', async () => {
    await sentSchema();
    const params = create.mock.calls[0][0];
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.output_config.effort).toBe('high');
    expect(params.tool_choice).toBeUndefined();
    expect(params.tools).toBeUndefined();
  });

  it('sends a PDF as a document block and an image as an image block', async () => {
    create.mockResolvedValue(reply);
    await structuredTurn({
      ...settings,
      input: 'i',
      schema: z.object({}),
      images: [
        { mediaType: 'application/pdf', data: 'AA' },
        { mediaType: 'image/png', data: 'BB' },
      ],
    });
    const content = create.mock.calls[0][0].messages[0].content;
    expect(content.map((block: Json) => block.type)).toEqual(['document', 'image', 'text']);
  });
});

// docs/llm-context/anthropic-structured-outputs.md, "JSON Schema limitations".
describe('the invoice schema fits the API limits', () => {
  it('has at most 16 union-typed parameters', async () => {
    let unions = 0;
    walk(await sentSchema(), (object) => {
      if (object.anyOf || Array.isArray(object.type)) unions++;
    });
    expect(unions).toBeGreaterThan(0);
    expect(unions).toBeLessThanOrEqual(16);
  });

  it('has no optional parameters and closes every object', async () => {
    walk(await sentSchema(), (object) => {
      if (object.type !== 'object') return;
      expect(object.additionalProperties).toBe(false);
      expect(Object.keys(object.properties as Json).sort()).toEqual([...(object.required as string[])].sort());
    });
  });

  it('uses no unsupported keyword', async () => {
    const banned = ['minimum', 'maximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems', 'exclusiveMinimum'];
    walk(await sentSchema(), (object) => {
      for (const keyword of banned) expect(object[keyword]).toBeUndefined();
    });
  });
});

describe('toolTurn', () => {
  it('maps tools, tool calls and thinking blocks in both directions', async () => {
    const thinking = { type: 'thinking', thinking: '', signature: 'sig' };
    create.mockResolvedValue({
      ...reply,
      stop_reason: 'tool_use',
      content: [thinking, { type: 'tool_use', id: 't1', name: 'add', input: { a: 1 } }],
    });
    const result = await toolTurn({
      ...settings,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [
        {
          name: 'add',
          description: 'adds',
          inputSchema: z.object({ a: z.number() }),
          execute: async () => null,
        },
      ],
    });
    expect(result.blocks).toEqual([
      { type: 'opaque', data: thinking },
      { type: 'tool_call', id: 't1', name: 'add', input: { a: 1 } },
    ]);
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 4 });
    expect(create.mock.calls[0][0].tools[0].input_schema.type).toBe('object');

    create.mockResolvedValue(reply);
    await toolTurn({
      ...settings,
      tools: [],
      messages: [
        { role: 'assistant', content: result.blocks },
        { role: 'user', content: [{ type: 'tool_result', toolCallId: 't1', content: '{}' }] },
      ],
    });
    const [assistant, user] = create.mock.calls[1][0].messages;
    expect(assistant.content).toEqual([
      thinking,
      { type: 'tool_use', id: 't1', name: 'add', input: { a: 1 } },
    ]);
    expect(user.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
  });
});
