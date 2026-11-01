import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmError } from '@/lib/llm';

const generateStructured = vi.hoisted(() => vi.fn());
vi.mock('@/lib/llm', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/llm')>()),
  generateStructured,
}));

const { explainMatch, PROMPT_VERSION } = await import('@/lib/llm/explain-match');

const input = {
  status: 'PARTIAL_MATCH' as const,
  vetoCode: null,
  scoreBreakdown: null,
  comparisons: [
    { field: 'Subtotal / total PO', invoiceValue: 15750000, masterValue: 15000000.5 },
    { field: 'Nomor rekening', invoiceValue: '1234567890', masterValue: '1234567890' },
  ],
};
const says = (explanation: string) => generateStructured.mockResolvedValue({ data: { explanation } });

describe('explainMatch', () => {
  beforeEach(() => {
    generateStructured.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('asks for the explain_match purpose, with the prompt version and the input as data', async () => {
    says('Nominal berbeda.');
    await expect(explainMatch(input)).resolves.toBe('Nominal berbeda.');
    const options = generateStructured.mock.calls[0][0];
    expect(options).toMatchObject({ purpose: 'explain_match', promptVersion: PROMPT_VERSION });
    expect(options.input).toBe(`<match>\n${JSON.stringify(input)}\n</match>`);
    expect(options.system).toMatch(/untrusted data/);
  });

  it('accepts given numbers in any printed format', async () => {
    const text = 'Subtotal Rp 15.750.000,00 melebihi 15000000.5 untuk rekening 1234567890.';
    says(text);
    await expect(explainMatch(input)).resolves.toBe(text);
  });

  it('drops a text that quotes a number it was not given', async () => {
    says('Selisihnya Rp 987.654.');
    await expect(explainMatch(input)).resolves.toBeNull();
  });

  it('returns null on an LLM error', async () => {
    generateStructured.mockRejectedValue(new LlmError('missing_api_key', []));
    await expect(explainMatch(input)).resolves.toBeNull();
  });

  it('returns null on any other error', async () => {
    generateStructured.mockRejectedValue(new Error('boom'));
    await expect(explainMatch(input)).resolves.toBeNull();
  });

  it('stops waiting after 15 seconds', async () => {
    vi.useFakeTimers();
    generateStructured.mockReturnValue(new Promise(() => {}));
    const result = explainMatch(input);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(result).resolves.toBeNull();
  });
});
