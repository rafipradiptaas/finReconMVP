import type { z } from 'zod';
import { MAX_STRUCTURED_ATTEMPTS, purposeConfig } from './config';
import { estimateCostUsd, logCall, type LlmCallRecord } from './log-call';
import * as anthropic from './providers/anthropic';
import * as openaiCompatible from './providers/openai-compatible';
import type { CallOptions, LlmBlock, LlmImage, LlmMessage, LlmTool, LlmUsage, TurnResult } from './types';

export type { LlmCallRecord, LlmCallSink } from './log-call';
export type { LlmBlock, LlmImage, LlmMessage, LlmTool } from './types';

/** Thrown after retries are spent. records holds every attempt, for callers with no database. */
export class LlmError extends Error {
  constructor(
    readonly code: string,
    readonly records: LlmCallRecord[],
  ) {
    super(`LLM call failed: ${code}`);
  }
}

const ADAPTERS = { anthropic, deepseek: openaiCompatible };

function settings({ purpose, model, effort }: CallOptions) {
  try {
    const config = purposeConfig(purpose);
    return {
      ...config,
      adapter: ADAPTERS[config.provider],
      model: model ?? config.model,
      effort: effort ?? config.effort,
    };
  } catch (error) {
    console.error(error);
    throw new LlmError('config_error', []);
  }
}

function record(
  options: CallOptions,
  model: string,
  started: number,
  usage: LlmUsage | undefined,
  errorCode: string | null,
): LlmCallRecord {
  return {
    purpose: options.purpose,
    model,
    prompt_version: options.promptVersion,
    input_tokens: usage?.inputTokens ?? null,
    output_tokens: usage?.outputTokens ?? null,
    cost_estimate_usd: usage ? estimateCostUsd(model, usage) : null,
    latency_ms: Date.now() - started,
    ok: errorCode === null,
    error_code: errorCode,
  };
}

/** The code goes to llm_calls; the message is what tells an operator what to fix. */
function providerFailure(adapter: (typeof ADAPTERS)['anthropic' | 'deepseek'], error: unknown) {
  const code = adapter.providerErrorCode(error);
  console.error(`LLM call failed (${code}):`, error instanceof Error ? error.message : error);
  return code;
}

const textOf = (blocks: LlmBlock[]) =>
  blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');

function parseOutput<Schema extends z.ZodType>(turn: TurnResult, schema: Schema) {
  let json: unknown;
  try {
    json = JSON.parse(textOf(turn.blocks));
  } catch {
    return { errorCode: 'invalid_json' } as const;
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { data: parsed.data } : ({ errorCode: 'schema_invalid' } as const);
}

/** Returns validated output or throws LlmError. Invalid output gets one retry (D19). */
export async function generateStructured<Schema extends z.ZodType>(
  options: CallOptions & { system: string; input: string; images?: LlmImage[]; schema: Schema },
): Promise<{ data: z.output<Schema>; model: string; records: LlmCallRecord[] }> {
  const { adapter, model, effort, maxTokens } = settings(options);
  const { system, input, images, schema } = options;
  const records: LlmCallRecord[] = [];
  let code = 'provider_error';

  for (let attempt = 1; attempt <= MAX_STRUCTURED_ATTEMPTS; attempt++) {
    const started = Date.now();
    let turn: TurnResult;
    try {
      turn = await adapter.structuredTurn({ model, effort, maxTokens, system, input, images, schema });
    } catch (error) {
      // The SDK already retries transient failures, so this one is final.
      code = providerFailure(adapter, error);
      records.push(await logCall(record(options, model, started, undefined, code), options.log));
      break;
    }

    if (turn.stopReason === 'refusal') {
      code = 'refusal';
      records.push(await logCall(record(options, model, started, turn.usage, code), options.log));
      break;
    }

    const output = parseOutput(turn, schema);
    if ('data' in output) {
      records.push(await logCall(record(options, model, started, turn.usage, null), options.log));
      return { data: output.data as z.output<Schema>, model, records };
    }
    code = output.errorCode;
    records.push(await logCall(record(options, model, started, turn.usage, code), options.log));
  }
  throw new LlmError(code, records);
}

async function runTool(tools: LlmTool[], call: Extract<LlmBlock, { type: 'tool_call' }>) {
  const fail = (content: string): LlmBlock => ({
    type: 'tool_result',
    toolCallId: call.id,
    content,
    isError: true,
  });
  const tool = tools.find((candidate) => candidate.name === call.name);
  if (!tool) return fail(`Unknown tool: ${call.name}`);

  const input = tool.inputSchema.safeParse(call.input);
  if (!input.success) return fail(`Invalid input: ${input.error.message}`);
  try {
    const content = JSON.stringify(await tool.execute(input.data));
    return { type: 'tool_result', toolCallId: call.id, content } satisfies LlmBlock;
  } catch {
    return fail('The tool failed.');
  }
}

/**
 * The tool-use loop. Stops when the model stops calling tools or after
 * maxIterations model turns, whichever comes first. Tool code runs here, so a
 * model can only ever do what the given tools do.
 */
export async function runToolLoop(
  options: CallOptions & {
    system: string;
    messages: LlmMessage[];
    tools: LlmTool[];
    maxIterations: number;
    /** Ends the loop once one of these tools has run successfully. */
    stopAfterTools?: string[];
  },
) {
  const { adapter, model, effort, maxTokens } = settings(options);
  const { system, tools, maxIterations } = options;
  const messages = [...options.messages];
  const records: LlmCallRecord[] = [];
  const toolsCalled: string[] = [];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const started = Date.now();
    let turn: TurnResult;
    try {
      turn = await adapter.toolTurn({ model, effort, maxTokens, system, messages, tools });
    } catch (error) {
      const code = providerFailure(adapter, error);
      records.push(await logCall(record(options, model, started, undefined, code), options.log));
      throw new LlmError(code, records);
    }
    records.push(await logCall(record(options, model, started, turn.usage, null), options.log));
    messages.push({ role: 'assistant', content: turn.blocks });

    const calls = turn.blocks.filter((block) => block.type === 'tool_call');
    if (turn.stopReason !== 'tool_use' || calls.length === 0) {
      return { text: textOf(turn.blocks), messages, records, toolsCalled, stoppedAtCap: false };
    }

    toolsCalled.push(...calls.map((call) => call.name));
    // Every result of a turn goes back in one message.
    const results = await Promise.all(calls.map((call) => runTool(tools, call)));
    messages.push({ role: 'user', content: results });

    const succeeded = calls.filter((_, index) => !(results[index] as { isError?: boolean }).isError);
    if (succeeded.some((call) => options.stopAfterTools?.includes(call.name))) {
      return { text: '', messages, records, toolsCalled, stoppedAtCap: false };
    }
  }
  return { text: '', messages, records, toolsCalled, stoppedAtCap: true };
}
