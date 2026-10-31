import type { z } from 'zod';
import type { Effort } from './config';
import type { LlmCallSink } from './log-call';
import type { LlmPurpose } from '@/types/domain';

/** Provider-neutral formats. Only the adapter knows the provider's shapes (D19). */
export type LlmUsage = { inputTokens: number; outputTokens: number };

export type LlmImage = {
  mediaType: 'image/png' | 'image/jpeg' | 'application/pdf';
  /** base64, no newlines. */
  data: string;
};

export type LlmBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolCallId: string; content: string; isError?: boolean }
  /** Provider state (thinking) that must go back unchanged on the next turn. */
  | { type: 'opaque'; data: unknown };

export type LlmMessage = { role: 'user' | 'assistant'; content: string | LlmBlock[] };

export type LlmTool<Schema extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  inputSchema: Schema;
  execute: (input: z.output<Schema>) => Promise<unknown>;
};

/** Who is calling and how to record it. model and effort override config, for the eval. */
export type CallOptions = {
  purpose: LlmPurpose;
  promptVersion: string;
  log?: LlmCallSink;
  model?: string;
  effort?: Effort;
};

export type TurnRequest = { model: string; effort: Effort; maxTokens: number; system: string };

export type TurnResult = {
  blocks: LlmBlock[];
  usage: LlmUsage;
  stopReason: string | null;
};
