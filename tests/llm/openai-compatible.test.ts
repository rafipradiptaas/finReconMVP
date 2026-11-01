import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const http = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', (...args: unknown[]) => http(...args));
vi.stubEnv('LLM_PROVIDER', 'deepseek');
vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');

const { generateStructured, runToolLoop } = await import('@/lib/llm');
const { DEEPSEEK } = await import('@/lib/llm/config');
const { extractInvoice } = await import('@/lib/llm/extract-invoice');

type Json = Record<string, unknown>;

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    // Stops the SDK's own retries, so each test counts only ours.
    headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
  });

const completion = (message: Json, finish_reason = 'stop') => ({
  id: 'c1',
  model: 'deepseek-flash',
  choices: [{ index: 0, finish_reason, message: { role: 'assistant', content: null, ...message } }],
  usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
});

const submitted = (args: string) =>
  completion(
    {
      tool_calls: [{ id: 't1', type: 'function', function: { name: 'submit_result', arguments: args } }],
    },
    'tool_calls',
  );

const toolCall = (id: string, args: string, extra: Json = {}) =>
  completion(
    { ...extra, tool_calls: [{ id, type: 'function', function: { name: 'add', arguments: args } }] },
    'tool_calls',
  );

const sent = (call: number) => {
  const [url, init] = http.mock.calls[call] as [string, { body: string; headers: Headers }];
  return { url: String(url), body: JSON.parse(init.body) as Json };
};

const options = { purpose: 'extract_invoice', promptVersion: 'test-1' } as const;
const schema = z.object({ a: z.number() });
const structured = () => generateStructured({ ...options, system: 's', input: 'i', schema });

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  http.mockReset();
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  DEEPSEEK.structuredMethod = 'strict_tool';
  vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
});

afterEach(() => errors.mockRestore());

describe('generateStructured over strict tool calling', () => {
  it('returns validated data with usage and a cost', async () => {
    http.mockImplementation(async () => respond(200, submitted('{"a":1}')));
    const result = await structured();
    expect(result.data).toEqual({ a: 1 });
    expect(result.model).toBe('deepseek-flash');
    expect(result.records[0]).toMatchObject({ input_tokens: 100, output_tokens: 20, ok: true });
    expect(result.records[0].cost_estimate_usd).toBeCloseTo((100 * 0.3 + 20 * 1.2) / 1e6);
  });

  it('sends the documented strict shape, with thinking off', async () => {
    http.mockImplementation(async () => respond(200, submitted('{"a":1}')));
    await structured();
    const { url, body } = sent(0);
    expect(url).toBe('https://api.deepseek.com/beta/chat/completions');
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'submit_result' } });
    const tool = (body.tools as { function: Json }[])[0].function;
    expect(tool.strict).toBe(true);
    expect(tool.parameters).toMatchObject({ type: 'object', additionalProperties: false, required: ['a'] });
    expect(tool.parameters).not.toHaveProperty('$schema');
  });

  it('invalid JSON → one retry → failure', async () => {
    http.mockImplementation(async () => respond(200, submitted('{"a":')));
    await expect(structured()).rejects.toMatchObject({ code: 'invalid_json' });
    expect(http).toHaveBeenCalledTimes(2);
  });

  it('schema-invalid output → one retry → failure', async () => {
    http.mockImplementation(async () => respond(200, submitted('{"a":"x"}')));
    await expect(structured()).rejects.toMatchObject({ code: 'schema_invalid' });
    expect(http).toHaveBeenCalledTimes(2);
  });

  it('a content filter stop is a refusal and is not retried', async () => {
    http.mockImplementation(async () => respond(200, completion({ content: '' }, 'content_filter')));
    await expect(structured()).rejects.toMatchObject({ code: 'refusal' });
    expect(http).toHaveBeenCalledTimes(1);
  });

  it('extracts through the real invoice schema', async () => {
    http.mockImplementation(async () => respond(200, submitted('{"invoice_number":"nope"}')));
    await expect(extractInvoice('dokumen')).resolves.toMatchObject({ ok: false, errorCode: 'schema_invalid' });
  });
});

describe('the invoice schema fits the documented strict limits', () => {
  it('requires every property, closes every object, and avoids unsupported keywords', async () => {
    http.mockImplementation(async () => respond(200, submitted('{}')));
    await extractInvoice('dokumen');
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      const object = node as Json;
      if (object.type === 'object') {
        expect(object.additionalProperties).toBe(false);
        expect(Object.keys(object.properties as Json).sort()).toEqual([...(object.required as string[])].sort());
      }
      for (const keyword of ['minLength', 'maxLength', 'minItems', 'maxItems']) {
        expect(object[keyword]).toBeUndefined();
      }
      Object.values(object).forEach(walk);
    };
    walk((sent(0).body.tools as { function: Json }[])[0].function.parameters);
  });
});

describe('generateStructured over JSON mode', () => {
  beforeEach(() => {
    DEEPSEEK.structuredMethod = 'json_object';
  });

  it('puts the schema in the prompt and keeps thinking on', async () => {
    http.mockImplementation(async () => respond(200, completion({ content: '{"a":1}' })));
    await expect(structured()).resolves.toMatchObject({ data: { a: 1 } });
    const { url, body } = sent(0);
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.reasoning_effort).toBe('high');
    expect((body.messages as { content: string }[])[0].content).toMatch(/JSON schema/);
    expect(body.tools).toBeUndefined();
  });

  it('retries the blank content the docs warn about', async () => {
    http
      .mockImplementationOnce(async () => respond(200, completion({ content: '    ' })))
      .mockImplementationOnce(async () => respond(200, completion({ content: '{"a":2}' })));
    await expect(structured()).resolves.toMatchObject({ data: { a: 2 } });
  });
});

describe('runToolLoop', () => {
  const execute = vi.fn(async ({ a }: { a: number }) => ({ sum: a + 1 }));
  const run = (maxIterations = 6) =>
    runToolLoop({
      purpose: 'agent_followup',
      promptVersion: 'agent-1',
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [
        {
          name: 'add',
          description: 'adds',
          inputSchema: z.object({ a: z.number() }),
          execute: execute as never,
        },
      ],
      maxIterations,
    });

  beforeEach(() => {
    execute.mockClear();
  });

  it('translates one tool call round trip, including reasoning_content', async () => {
    http
      .mockImplementationOnce(async () =>
        respond(200, toolCall('t1', '{"a":1}', { reasoning_content: 'thinking', content: 'cek' })),
      )
      .mockImplementationOnce(async () => respond(200, completion({ content: 'selesai' })));

    const result = await run();
    expect(result.text).toBe('selesai');
    expect(result.toolsCalled).toEqual(['add']);
    expect(execute).toHaveBeenCalledWith({ a: 1 });

    const first = sent(0).body;
    expect((first.tools as { function: Json }[])[0].function.name).toBe('add');
    expect((first.messages as Json[])[0]).toEqual({ role: 'system', content: 'sys' });

    expect(sent(1).body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: 'cek',
        reasoning_content: 'thinking',
        tool_calls: [{ id: 't1', type: 'function', function: { name: 'add', arguments: '{"a":1}' } }],
      },
      { role: 'tool', tool_call_id: 't1', content: '{"sum":2}' },
    ]);
  });

  it('stops at the iteration cap', async () => {
    http.mockImplementation(async () => respond(200, toolCall('t1', '{"a":1}')));
    const result = await run(3);
    expect(http).toHaveBeenCalledTimes(3);
    expect(result.stoppedAtCap).toBe(true);
  });

  it('a malformed argument string reaches the model as an error, not the tool', async () => {
    http
      .mockImplementationOnce(async () => respond(200, toolCall('t1', '{"a":')))
      .mockImplementationOnce(async () => respond(200, completion({ content: 'ok' })));
    await run();
    expect(execute).not.toHaveBeenCalled();
    const messages = sent(1).body.messages as Json[];
    expect(messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 't1' });
    expect(messages.at(-1)!.content).toMatch(/Invalid input/);
  });
});

describe('error codes', () => {
  it.each([
    [401, 'auth_rejected'],
    [403, 'auth_rejected'],
    [402, 'insufficient_balance'],
    [429, 'rate_limited'],
    [400, 'bad_request'],
    [422, 'bad_request'],
    [500, 'provider_error'],
    [503, 'provider_error'],
  ])('HTTP %i → %s, with no retry of ours', async (status, code) => {
    http.mockImplementation(async () => respond(status, { error: { message: 'failed' } }));
    const failure = await structured().catch((error) => error);
    expect(failure.code).toBe(code);
    expect(failure.records).toHaveLength(1);
    expect(failure.records[0]).toMatchObject({ ok: false, error_code: code, input_tokens: null });
    expect(http).toHaveBeenCalledTimes(1);
  });

  it('a network failure has its own code', async () => {
    http.mockRejectedValue(new TypeError('fetch failed'));
    await expect(structured()).rejects.toMatchObject({ code: 'network_error' });
  });

  it('a missing key sends nothing', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    await expect(structured()).rejects.toMatchObject({ code: 'missing_api_key' });
    expect(http).not.toHaveBeenCalled();
  });

  it('never falls back to OPENAI_API_KEY', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', 'another-service');
    await expect(structured()).rejects.toMatchObject({ code: 'missing_api_key' });
    vi.stubEnv('OPENAI_API_KEY', '');
  });
});
