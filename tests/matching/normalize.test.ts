import { describe, expect, it } from 'vitest';
import {
  normalizeAccount,
  normalizeInvoiceNumber,
  normalizeName,
  normalizeNpwp,
  normalizePoNumber,
} from '@/lib/matching/normalize';

describe('normalize', () => {
  it('account: digits only', () => {
    expect(normalizeAccount('1234-5678 90')).toBe('1234567890');
  });

  it('name: uppercased, punctuation stripped, spacing collapsed', () => {
    expect(normalizeName('  PT. Sinar  Logistik, Tbk. ')).toBe('PT SINAR LOGISTIK TBK');
    expect(normalizeName('CV Maju-Jaya')).toBe('CV MAJU JAYA');
  });

  it('npwp: digits only', () => {
    expect(normalizeNpwp('01.123.456.7-891.000')).toBe('011234567891000');
  });

  it('invoice number: inv-001 = INV001 = inv 001', () => {
    expect(normalizeInvoiceNumber('inv-001')).toBe('INV001');
    expect(normalizeInvoiceNumber('INV001')).toBe('INV001');
    expect(normalizeInvoiceNumber('inv 001')).toBe('INV001');
  });

  it('PO number: compared the same way', () => {
    expect(normalizePoNumber('po-2026-001')).toBe('PO2026001');
    expect(normalizePoNumber('PO 2026 001')).toBe('PO2026001');
  });
});
