import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseVendorsCsv } from '@/lib/csv/vendors';

const HEADER =
  'vendor_code,vendor_name,npwp,bank_name,bank_account_number,bank_account_holder,status,last_verified_at,contact_email';
const row = (overrides: Partial<Record<string, string>> = {}) => {
  const values = {
    code: 'V1',
    npwp: '011234567891000',
    account: '1234567890',
    status: 'verified',
    date: '2026-01-01',
    email: 'a@b.example',
    ...overrides,
  };
  return `${values.code},PT A,${values.npwp},BCA,${values.account},PT A,${values.status},${values.date},${values.email}`;
};
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');

function errorsOf(text: string) {
  const result = parseVendorsCsv(text);
  if (result.ok) throw new Error('expected the file to be rejected');
  return result.errors;
}

describe('parseVendorsCsv', () => {
  it('accepts the fixture file', () => {
    const result = parseVendorsCsv(readFileSync('fixtures/vendors.csv', 'utf8'));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.rows).toHaveLength(10);
    expect(result.rows.filter((vendor) => vendor.contact_email === null)).toHaveLength(1);
  });

  it('names row 3 and column npwp for a 14-digit NPWP', () => {
    const errors = errorsOf(csv(row({ code: 'V1' }), row({ code: 'V2', npwp: '01123456789100' })));
    expect(errors).toEqual([{ row: 3, column: 'npwp', message: 'NPWP harus 15 atau 16 digit' }]);
  });

  it('accepts 16 digits and strips punctuation from the NPWP', () => {
    const result = parseVendorsCsv(csv(row({ npwp: '01.123.456.7-891.0001' })));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.rows[0].npwp).toBe('0112345678910001');
  });

  it('rejects a non-digit account number', () => {
    expect(errorsOf(csv(row({ account: '1234-5678' })))[0]).toMatchObject({
      row: 2,
      column: 'bank_account_number',
    });
  });

  it('rejects a bad email but allows an empty one', () => {
    expect(errorsOf(csv(row({ email: 'bukan-email' })))[0].column).toBe('contact_email');
    const result = parseVendorsCsv(csv(row({ email: '' })));
    expect(result.ok && result.rows[0].contact_email).toBeNull();
  });

  it('treats contact_email and last_verified_at as optional columns', () => {
    const text = [
      'vendor_code,vendor_name,npwp,bank_name,bank_account_number,bank_account_holder,status',
      'V1,PT A,011234567891000,BCA,123,PT A,verified',
    ].join('\n');
    const result = parseVendorsCsv(text);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.rows[0]).toMatchObject({ contact_email: null, last_verified_at: null });
  });

  it('rejects an unknown status and an invalid date', () => {
    expect(errorsOf(csv(row({ status: 'aktif' })))[0].column).toBe('status');
    expect(errorsOf(csv(row({ date: '31/12/2026' })))[0].column).toBe('last_verified_at');
  });

  it('rejects a duplicate vendor_code on its own row', () => {
    expect(errorsOf(csv(row(), row()))).toMatchObject([{ row: 3, column: 'vendor_code' }]);
  });

  it('reports every bad row, not just the first', () => {
    const errors = errorsOf(csv(row({ code: 'V1', npwp: '1' }), row({ code: 'V2', account: 'x' })));
    expect(errors.map((error) => error.row)).toEqual([2, 3]);
  });

  it('rejects a missing column, an empty file, and a short row', () => {
    expect(errorsOf('vendor_code,vendor_name\nV1,PT A')).toContainEqual({
      row: 1,
      column: 'npwp',
      message: 'Kolom tidak ditemukan',
    });
    expect(errorsOf(HEADER)[0].message).toBe('File tidak berisi data');
    expect(errorsOf(csv('V1,PT A'))[0]).toMatchObject({ row: 2, column: '' });
  });

  it('keeps file line numbers across blank lines and accepts a BOM', () => {
    expect(errorsOf(`﻿${csv(row({ code: 'V1' }), '', row({ code: 'V2', npwp: '1' }))}`)).toMatchObject([
      { row: 4, column: 'npwp' },
    ]);
  });
});
