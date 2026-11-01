import { describe, expect, it } from 'vitest';
import { BANK_ALIASES } from '@/lib/matching/config';
import { normalizeBankName, sameBank } from '@/lib/matching/normalize';

describe('normalizeBankName', () => {
  const aliases = Object.entries(BANK_ALIASES).flatMap(([bank, names]) =>
    names.map((name) => [name, bank] as const),
  );

  it.each(aliases)('%s → %s', (alias, bank) => {
    expect(normalizeBankName(alias)).toBe(bank);
  });

  it('covers the nine agreed banks', () => {
    expect(Object.keys(BANK_ALIASES).sort()).toEqual(
      ['BCA', 'BNI', 'BRI', 'BSI', 'BTN', 'CIMB NIAGA', 'DANAMON', 'MANDIRI', 'PERMATA'].sort(),
    );
  });

  it.each([
    ['bank bca', 'BCA'],
    ['  BANK   Mandiri ', 'MANDIRI'],
    ['PT. Bank Central Asia, Tbk.', 'BCA'],
    ['PT BANK NEGARA INDONESIA (PERSERO) TBK', 'BNI'],
  ])('ignores case, spacing and punctuation: %j', (input, bank) => {
    expect(normalizeBankName(input)).toBe(bank);
  });

  it.each([
    ['PT Bank Mega Tbk', 'MEGA'],
    ['Bank Mega', 'MEGA'],
    ['BANK OCBC NISP, Tbk.', 'OCBC NISP'],
  ])('an unknown bank %j compares after stripping', (input, expected) => {
    expect(normalizeBankName(input)).toBe(expected);
  });
});

describe('sameBank', () => {
  it('matches what the extractor reads against master data', () => {
    expect(sameBank('Bank BCA', 'BCA')).toBe(true);
    expect(sameBank('PT Bank Central Asia Tbk', 'BCA')).toBe(true);
    expect(sameBank('Bank Mandiri', 'Mandiri')).toBe(true);
  });

  it('matches an unknown bank to itself', () => {
    expect(sameBank('PT Bank Mega Tbk', 'Bank Mega')).toBe(true);
  });

  it('tells different banks apart', () => {
    expect(sameBank('Bank BCA', 'Mandiri')).toBe(false);
    expect(sameBank('Bank Mega', 'BCA')).toBe(false);
  });

  it('a missing name never matches', () => {
    expect(sameBank(null, 'BCA')).toBe(false);
    expect(sameBank('BCA', null)).toBe(false);
    expect(sameBank(null, null)).toBe(false);
    expect(sameBank('Bank', 'PT')).toBe(false);
  });
});
