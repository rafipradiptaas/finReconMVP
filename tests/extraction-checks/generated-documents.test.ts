import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractPdfText, MIN_TEXT_CHARS } from '@/lib/document-router/extract-pdf-text';
import { documentStatus, runExtractionChecks } from '@/lib/extraction-checks';
import { allTruths, perfectExtraction, type Truth } from '../helpers/ground-truth';

const check = async (truth: Truth) => {
  const { fullText, items } = await extractPdfText(new Uint8Array(readFileSync(truth.file)));
  return {
    fullText,
    fields: runExtractionChecks(perfectExtraction(truth.fields), { text: fullText, items }),
  };
};

const withText = allTruths().filter((truth) => truth.expected.document_status !== 'UNSUPPORTED_FORMAT');

describe('every generated PDF against its ground truth', () => {
  it('covers the fixtures and the eval set', () => {
    expect(withText.length).toBeGreaterThanOrEqual(21);
    expect(new Set(allTruths().map((truth) => truth.template)).size).toBeGreaterThanOrEqual(4);
  });

  it.each(withText.map((truth) => [truth.doc_id, truth] as const))(
    '%s reaches the expected status with a perfect read',
    async (_, truth) => {
      const { fields } = await check(truth);
      expect(documentStatus(fields)).toBe(truth.expected.document_status);
    },
  );

  it.each(withText.map((truth) => [truth.doc_id, truth] as const))(
    '%s has every true value grounded in its text',
    async (_, truth) => {
      const { fields } = await check(truth);
      const { line_items, ...scalars } = fields;
      for (const [name, field] of Object.entries(scalars)) {
        if (field.value !== null) expect([name, field.signals.grounded]).not.toEqual([name, false]);
      }
      expect(line_items.every((line) => line.signals.grounded !== false)).toBe(true);
      expect(line_items.every((line) => line.signals.arithmetic_ok)).toBe(true);
    },
  );

  it('routes the scanned fixture to UNSUPPORTED_FORMAT', async () => {
    const scan = allTruths().filter((truth) => truth.expected.document_status === 'UNSUPPORTED_FORMAT');
    expect(scan).toHaveLength(1);
    const { fullText } = await extractPdfText(new Uint8Array(readFileSync(scan[0].file)));
    expect(fullText.length).toBeLessThan(MIN_TEXT_CHARS);
  });
});

describe('what the checks must catch on real documents', () => {
  const fx = (id: string) => allTruths().find((truth) => truth.doc_id === id)!;

  it('a misread digit in the account is not grounded', async () => {
    const truth = fx('fx01');
    const misread = { ...truth, fields: { ...truth.fields, bank_account_number: '1234567891' } };
    const { fields } = await check(misread);
    expect(fields.bank_account_number.verification).toBe('unverified');
    expect(documentStatus(fields)).toBe('NEEDS_CORRECTION');
  });

  it('the buyer NPWP printed on the invoice is still only as good as its format', async () => {
    const truth = fx('fx01');
    const { fields } = await check({
      ...truth,
      fields: { ...truth.fields, npwp: '0100011120930' },
    });
    expect(fields.npwp.signals.format_ok).toBe(false);
  });

  it('a subtotal swapped with the total breaks the arithmetic', async () => {
    const truth = fx('fx01');
    const { fields } = await check({
      ...truth,
      fields: { ...truth.fields, subtotal: truth.fields.total_amount },
    });
    expect(fields.subtotal.signals.grounded).toBe(true);
    expect(fields.subtotal.signals.arithmetic_ok).toBe(false);
    expect(documentStatus(fields)).toBe('NEEDS_CORRECTION');
  });
});
