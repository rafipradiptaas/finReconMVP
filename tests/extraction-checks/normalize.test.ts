import { describe, expect, it } from 'vitest';
import {
  normalizeDate,
  normalizeDigits,
  normalizeInvoiceNumber,
  normalizeMoney,
  normalizeText,
} from '@/lib/extraction-checks/normalize';

describe('normalizeMoney', () => {
  it.each([
    ['15.750.000,00', 15750000],
    ['15,750,000.00', 15750000],
    ['Rp15.750.000', 15750000],
    ['Rp 15.750.000,50', 15750000.5],
    ['IDR 15,750,000', 15750000],
    ['15750000', 15750000],
    ['15.750', 15750],
    ['15,750', 15750],
    ['1.234.567', 1234567],
    ['100,50', 100.5],
    ['100.50', 100.5],
    ['0', 0],
    ['15.750.000,-', 15750000],
  ])('%s → %d', (input, expected) => {
    expect(normalizeMoney(input)).toBe(expected);
  });

  it.each(['', 'abc', '12.34.56', '1,23,456', '1.234,56.7', '-500'])('rejects %j', (input) => {
    expect(normalizeMoney(input)).toBeNull();
  });
});

describe('normalizeDate', () => {
  it.each([
    ['31/10/2026', '2026-10-31'],
    ['31-10-2026', '2026-10-31'],
    ['31.10.2026', '2026-10-31'],
    ['2026-10-31', '2026-10-31'],
    ['31 Oktober 2026', '2026-10-31'],
    ['31 Okt 2026', '2026-10-31'],
    ['1 Januari 2026', '2026-01-01'],
    ['5 Mei 2026', '2026-05-05'],
    ['17 Agustus 2026', '2026-08-17'],
    ['17 Agt 2026', '2026-08-17'],
    ['25 Desember 2026', '2026-12-25'],
    ['Oct 31, 2026', '2026-10-31'],
    ['October 31, 2026', '2026-10-31'],
    ['31 October 2026', '2026-10-31'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });

  it('reads dd/mm, never mm/dd', () => {
    expect(normalizeDate('03/04/2026')).toBe('2026-04-03');
  });

  it.each(['', '31/02/2026', '32/01/2026', '13/13/2026', '2026-13-01', '31 Foo 2026', 'besok'])(
    'rejects %j',
    (input) => {
      expect(normalizeDate(input)).toBeNull();
    },
  );
});

describe('digits, text and invoice numbers', () => {
  it('keeps only digits', () => {
    expect(normalizeDigits('01.123.456.7-891.000')).toBe('011234567891000');
    expect(normalizeDigits('1234-5678 90')).toBe('1234567890');
  });

  it('trims and collapses whitespace', () => {
    expect(normalizeText('  PT   Sinar \n Logistik ')).toBe('PT Sinar Logistik');
  });

  it('compares invoice numbers on letters and digits only', () => {
    expect(normalizeInvoiceNumber('inv-001')).toBe('INV001');
    expect(normalizeInvoiceNumber('INV 001')).toBe('INV001');
    expect(normalizeInvoiceNumber('GKI/INV/2026/045')).toBe('GKIINV2026045');
  });
});
