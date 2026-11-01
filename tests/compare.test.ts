import { describe, expect, it } from 'vitest';
import { fieldCorrect } from '../scripts/compare';

describe('fieldCorrect', () => {
  it('money must match exactly', () => {
    expect(fieldCorrect('subtotal', 1000, 1000)).toBe(true);
    expect(fieldCorrect('total_amount', 1000.01, 1000)).toBe(false);
  });

  it('null and zero tax are the same on a non-PKP invoice', () => {
    expect(fieldCorrect('tax_amount', null, 0)).toBe(true);
    expect(fieldCorrect('tax_amount', 110, 0)).toBe(false);
  });

  it('compares digits through separators', () => {
    expect(fieldCorrect('npwp', '01.123.456.7-891.000', '011234567891000')).toBe(true);
  });

  it('keeps the letter O distinct from zero', () => {
    expect(fieldCorrect('invoice_number', 'inv-001 ', 'INV-001')).toBe(true);
    expect(fieldCorrect('invoice_number', 'INV-OO1', 'INV-001')).toBe(false);
  });

  it('a value read where the truth is empty is wrong', () => {
    expect(fieldCorrect('invoice_number', 'INV-1', null)).toBe(false);
    expect(fieldCorrect('invoice_number', null, null)).toBe(true);
  });
});
