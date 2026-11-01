/** Stored in llm_calls.error_code. Each one points at a different fix. */
export type LlmErrorCode =
  | 'missing_api_key'
  | 'auth_rejected'
  | 'insufficient_balance'
  | 'rate_limited'
  | 'bad_request'
  | 'provider_error'
  | 'network_error'
  | 'refusal'
  | 'invalid_json'
  | 'schema_invalid'
  | 'config_error';

/** Raised before any request is sent, so a missing key is never reported as an outage. */
export class MissingApiKeyError extends Error {
  constructor(variable: string) {
    super(`${variable} is not set`);
  }
}

export function codeForStatus(status: number): LlmErrorCode {
  if (status === 401 || status === 403) return 'auth_rejected';
  if (status === 402) return 'insufficient_balance';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 422) return 'bad_request';
  return 'provider_error';
}
