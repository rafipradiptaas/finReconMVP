import { describe, expect, it } from 'vitest';
import { correctionsSchema } from '@/lib/extraction-checks/corrections';

const parse = (input: unknown) => correctionsSchema.safeParse(input);

describe('correctionsSchema', () => {
  it('normalizes what it accepts', () => {
    expect(
      parse({
        invoice_number: '  INV  001 ',
        invoice_date: '31 Oktober 2026',
        npwp: '01.123.456.7-891.000',
        bank_account_number: '1234-5678 90',
        subtotal: 1000,
      }).data,
    ).toEqual({
      invoice_number: 'INV 001',
      invoice_date: '2026-10-31',
      npwp: '011234567891000',
      bank_account_number: '1234567890',
      subtotal: 1000,
    });
  });

  it('allows clearing a field', () => {
    expect(parse({ po_number: null, tax_amount: null }).success).toBe(true);
  });

  it.each([
    ['nothing to change', {}],
    ['a blank invoice number', { invoice_number: '   ' }],
    ['a bad date', { invoice_date: '31/02/2026' }],
    ['a short NPWP', { npwp: '0112345' }],
    ['letters in an account', { bank_account_number: '123O456789' }],
    ['a negative amount', { total_amount: -1 }],
    ['an amount sent as text', { subtotal: '1000' }],
    ['an unknown field', { status: 'EXTRACTED' }],
    ['line items', { line_items: [] }],
  ])('refuses %s', (_, input) => {
    expect(parse(input).success).toBe(false);
  });

  it('refuses a body that is not an object', () => {
    expect(parse(null).success).toBe(false);
  });
});
