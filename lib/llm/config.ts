import type { LlmPurpose } from '@/types/domain';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

type PurposeConfig = { model: string; effort: Effort; maxTokens: number };

// Non-streaming requests stay at 16000 so they fit the SDK's HTTP timeout.
export const LLM_CONFIG: Record<LlmPurpose, PurposeConfig> = {
  extract_invoice: { model: 'claude-sonnet-5-5', effort: 'high', maxTokens: 16000 },
  extract_invoice_vision: { model: 'claude-sonnet-5-5', effort: 'high', maxTokens: 16000 },
  explain_match: { model: 'claude-haiku-5-5', effort: 'low', maxTokens: 2000 },
  agent_followup: { model: 'claude-sonnet-5-5', effort: 'medium', maxTokens: 16000 },
  agent_reply: { model: 'claude-sonnet-5-5', effort: 'medium', maxTokens: 16000 },
  chatbot: { model: 'claude-sonnet-5-5', effort: 'low', maxTokens: 16000 },
};

// USD per million tokens. Verify against the official pricing page
// (docs/llm-context/anthropic-pricing.md, checked 2026-10-31).
export const PRICE_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

/** The first try plus one retry when the output fails validation (D19). */
export const MAX_STRUCTURED_ATTEMPTS = 2;
