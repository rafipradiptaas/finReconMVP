import { describe, expect, it } from 'vitest';
import { checkVeto, identifyVendor } from '@/lib/matching/veto';
import { invoice, paid, vendor } from './helpers';

describe('identifyVendor', () => {
  it('finds a vendor by exact NPWP, even under another name', () => {
    const found = identifyVendor(invoice({ vendor_name: 'Nama Lain Sekali' }), [vendor()]);
    expect(found?.id).toBe('v1');
  });

  it('compares NPWP after normalization', () => {
    const found = identifyVendor(invoice({ npwp: '01.123.456.7-891.000' }), [vendor()]);
    expect(found?.id).toBe('v1');
  });

  it('NPWP wins over a closer name', () => {
    const other = vendor({ id: 'v2', vendor_name: 'PT Sinar Logistik Nusantara', npwp: '099999999999999' });
    const owner = vendor({ id: 'v1', vendor_name: 'Nama Berbeda' });
    expect(identifyVendor(invoice(), [other, owner])?.id).toBe('v1');
  });

  it('falls back to the name when the NPWP is unknown', () => {
    expect(identifyVendor(invoice({ npwp: '000000000000000' }), [vendor()])?.id).toBe('v1');
    expect(identifyVendor(invoice({ npwp: null }), [vendor()])?.id).toBe('v1');
  });

  it('accepts a name similarity of 0.95 and refuses one below it', () => {
    // 0.9636 and below 0.95 for these two names against the master name.
    const above = invoice({ npwp: null, vendor_name: 'PT Sinar Logistik Nusantara Abadi' });
    expect(identifyVendor(above, [vendor()])?.id).toBe('v1');
    const below = invoice({ npwp: null, vendor_name: 'PT Sinar Logistik Antarpulau' });
    expect(identifyVendor(below, [vendor()])).toBeNull();
  });

  it('takes the highest similarity', () => {
    const a = vendor({ id: 'va', vendor_name: 'PT Sinar Logistik Nusantara', npwp: '1' });
    const b = vendor({ id: 'vb', vendor_name: 'PT Sinar Logistik Nusantaraa', npwp: '2' });
    const found = identifyVendor(invoice({ npwp: null, vendor_name: 'PT Sinar Logistik Nusantaraa' }), [a, b]);
    expect(found?.id).toBe('vb');
  });

  it('a tie on the name means not found', () => {
    const a = vendor({ id: 'va', npwp: '1' });
    const b = vendor({ id: 'vb', npwp: '2' });
    expect(identifyVendor(invoice({ npwp: null }), [a, b])).toBeNull();
  });

  it('with neither NPWP nor name, nothing is found', () => {
    expect(identifyVendor(invoice({ npwp: null, vendor_name: null }), [vendor()])).toBeNull();
  });

  it('a master vendor with no NPWP never matches on an empty value', () => {
    const blank = vendor({ npwp: null, vendor_name: 'Nama Lain' });
    expect(identifyVendor(invoice({ npwp: '' }), [blank])).toBeNull();
  });
});

describe('identifyVendor with gaps in master data', () => {
  it('skips a master vendor with no NPWP when the invoice has one', () => {
    const blank = vendor({ npwp: null, vendor_name: 'Nama Lain' });
    expect(identifyVendor(invoice({ npwp: '011234567891000' }), [blank])).toBeNull();
  });
});

describe('checkVeto', () => {
  const clear = { vetoCode: null, pendingDuplicateWarning: false };

  it('passes a clean invoice', () => {
    expect(checkVeto(invoice(), vendor(), [])).toEqual(clear);
  });

  it('VETO_VENDOR_NOT_FOUND when no vendor was identified', () => {
    expect(checkVeto(invoice(), null, []).vetoCode).toBe('VETO_VENDOR_NOT_FOUND');
  });

  it.each(['unverified', 'suspended'] as const)('VETO_VENDOR_NOT_VERIFIED when %s', (status) => {
    expect(checkVeto(invoice(), vendor({ status }), []).vetoCode).toBe('VETO_VENDOR_NOT_VERIFIED');
  });

  it.each([
    ['account number', { bank_account_number: '9999999999' }],
    ['bank', { bank_name: 'Bank Mandiri' }],
    ['account holder', { bank_account_holder: 'PT LAIN' }],
    ['a missing account', { bank_account_number: null }],
    ['a missing bank', { bank_name: null }],
    ['a missing holder', { bank_account_holder: null }],
  ])('VETO_BANK_MISMATCH on %s', (_, over) => {
    expect(checkVeto(invoice(over), vendor(), []).vetoCode).toBe('VETO_BANK_MISMATCH');
  });

  it('a master vendor with no bank data never passes the bank check', () => {
    const blank = vendor({ bank_account_number: null });
    expect(checkVeto(invoice(), blank, []).vetoCode).toBe('VETO_BANK_MISMATCH');
  });

  it('compares bank data after normalization', () => {
    const printed = invoice({
      bank_name: 'PT Bank Central Asia Tbk',
      bank_account_number: '1234-5678 90',
      bank_account_holder: 'PT. Sinar Logistik Nusantara',
    });
    expect(checkVeto(printed, vendor(), [])).toEqual(clear);
  });

  it.each(['APPROVED', 'PAID'] as const)('VETO_DUPLICATE_INVOICE against a %s twin', (review_status) => {
    const twin = paid({ invoice_number_normalized: 'INV001', review_status });
    expect(checkVeto(invoice(), vendor(), [twin]).vetoCode).toBe('VETO_DUPLICATE_INVOICE');
  });

  it('a duplicate matches on the normalized number', () => {
    const twin = paid({ invoice_number_normalized: 'INV001' });
    const printed = invoice({ invoice_number: 'inv 001' });
    expect(checkVeto(printed, vendor(), [twin]).vetoCode).toBe('VETO_DUPLICATE_INVOICE');
  });

  it('a PENDING_REVIEW twin does not veto, but warns', () => {
    const twin = paid({ invoice_number_normalized: 'INV001', review_status: 'PENDING_REVIEW' });
    expect(checkVeto(invoice(), vendor(), [twin])).toEqual({
      vetoCode: null,
      pendingDuplicateWarning: true,
    });
  });

  it('a REJECTED_BY_REVIEWER twin neither vetoes nor warns', () => {
    const twin = paid({ invoice_number_normalized: 'INV001', review_status: 'REJECTED_BY_REVIEWER' });
    expect(checkVeto(invoice(), vendor(), [twin])).toEqual(clear);
  });

  it('the same number at another vendor is not a duplicate', () => {
    const twin = paid({ invoice_number_normalized: 'INV001', vendor_id: 'v2' });
    expect(checkVeto(invoice(), vendor(), [twin])).toEqual(clear);
  });

  it('an invoice is never its own duplicate, so a re-run after correction is safe', () => {
    const self = paid({ invoice_id: 'i1', invoice_number_normalized: 'INV001' });
    expect(checkVeto(invoice({ id: 'i1' }), vendor(), [self])).toEqual(clear);
  });

  it('an invoice with no number has no duplicates', () => {
    const twin = paid({ invoice_number_normalized: '' });
    expect(checkVeto(invoice({ invoice_number: null }), vendor(), [twin])).toEqual(clear);
  });

  it('runs in order: not verified before bank mismatch', () => {
    const both = checkVeto(invoice({ bank_account_number: '9' }), vendor({ status: 'suspended' }), []);
    expect(both.vetoCode).toBe('VETO_VENDOR_NOT_VERIFIED');
  });

  it('runs in order: bank mismatch before duplicate', () => {
    const twin = paid({ invoice_number_normalized: 'INV001' });
    const both = checkVeto(invoice({ bank_account_number: '9' }), vendor(), [twin]);
    expect(both.vetoCode).toBe('VETO_BANK_MISMATCH');
  });
});
