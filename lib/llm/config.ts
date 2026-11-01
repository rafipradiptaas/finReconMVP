import type { LlmPurpose } from '@/types/domain';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type LlmProvider = 'deepseek' | 'anthropic';

type PurposeConfig = { provider: LlmProvider; model: string; effort?: Effort; maxTokens: number };

const deepseek = (effort: Effort, maxTokens = 16000): PurposeConfig => ({
  provider: 'deepseek',
  model: 'deepseek-flash',
  effort,
  maxTokens,
});
const claude = (model: string, effort: Effort, maxTokens = 16000): PurposeConfig => ({
  provider: 'anthropic',
  model,
  effort,
  maxTokens,
});

// The vision path is Anthropic on either setting, and only the eval calls it (D23).
const VISION = claude('claude-sonnet-5-5', 'high');

// Non-streaming requests stay at 16000 so they fit the SDK's HTTP timeout.
const BY_PROVIDER: Record<LlmProvider, Record<LlmPurpose, PurposeConfig>> = {
  deepseek: {
    extract_invoice: deepseek('high'),
    extract_invoice_vision: VISION,
    explain_match: deepseek('low', 2000),
    agent_followup: deepseek('high'),
    agent_reply: deepseek('high'),
    chatbot: deepseek('low'),
  },
  anthropic: {
    extract_invoice: claude('claude-sonnet-5-5', 'high'),
    extract_invoice_vision: VISION,
    explain_match: claude('claude-haiku-5-5', 'low', 2000),
    agent_followup: claude('claude-sonnet-5-5', 'medium'),
    agent_reply: claude('claude-sonnet-5-5', 'medium'),
    chatbot: claude('claude-sonnet-5-5', 'low'),
  },
};

/** LLM_PROVIDER selects the provider (D23). Read per call, so scripts can set it first. */
export function purposeConfig(purpose: LlmPurpose): PurposeConfig {
  const active = process.env.LLM_PROVIDER || 'deepseek';
  if (active !== 'deepseek' && active !== 'anthropic') {
    throw new Error(`Unknown LLM_PROVIDER: ${active}`);
  }
  return BY_PROVIDER[active][purpose];
}

// docs/llm-context/deepseek.md. strict needs the beta URL and rules out thinking
// mode (named tool_choice returns 400 there). json_object keeps thinking on.
export const DEEPSEEK = {
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  baseURL: 'https://api.deepseek.com',
  betaBaseURL: 'https://api.deepseek.com/beta',
  structuredMethod: 'strict_tool' as 'strict_tool' | 'json_object',
};

// USD per million tokens. Verify against the official pricing page
// (docs/llm-context/anthropic-pricing.md, docs/llm-context/deepseek.md, checked 2026-11-01).
// ponytail: DeepSeek uses the peak rate and ignores cache hits, so its cost is a
// ceiling. Off-peak is half; add time-of-day pricing if exact cost ever matters.
export const PRICE_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'deepseek-flash': { input: 0.3, output: 1.2 },
  'deepseek-v4-pro': { input: 1.32, output: 3.96 },
};

/** The first try plus one retry when the output fails validation (D19). */
export const MAX_STRUCTURED_ATTEMPTS = 2;
