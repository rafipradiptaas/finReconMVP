import type { SupabaseClient } from '@supabase/supabase-js';
import { PRICE_USD_PER_MTOK } from './config';
import type { LlmUsage } from './types';
import type { Database } from '@/types/database.types';
import type { LlmPurpose } from '@/types/domain';

export type LlmCallRecord = {
  purpose: LlmPurpose;
  model: string;
  prompt_version: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_estimate_usd: number | null;
  latency_ms: number;
  ok: boolean;
  error_code: string | null;
};

export type LlmCallSink = (record: LlmCallRecord) => Promise<void>;

export function estimateCostUsd(model: string, usage: LlmUsage): number | null {
  const price = PRICE_USD_PER_MTOK[model];
  if (!price) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

/**
 * Always returns the record, which is what scripts use (they have no database).
 * A logging failure is reported but never changes the outcome of the call.
 */
export async function logCall(record: LlmCallRecord, sink?: LlmCallSink): Promise<LlmCallRecord> {
  if (sink) await sink(record).catch((error) => console.error('llm_calls write failed', error));
  return record;
}

/** The app's sink. The caller supplies the client, so scripts never load Supabase. */
export function llmCallsWriter(
  db: SupabaseClient<Database>,
  organizationId: string,
  entity?: { type: string; id: string },
): LlmCallSink {
  return async (record) => {
    const { error } = await db.from('llm_calls').insert({
      ...record,
      organization_id: organizationId,
      entity_type: entity?.type ?? null,
      entity_id: entity?.id ?? null,
    });
    if (error) throw error;
  };
}
