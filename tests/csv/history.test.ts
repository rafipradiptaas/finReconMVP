import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseHistoryCsv } from '@/lib/csv/history';
import { parseVendorsCsv } from '@/lib/csv/vendors';

const HEADER = 'vendor_code,invoice_number,invoice_date,po_number,total_amount,paid_date';
const KNOWN = new Set(['V1']);
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');

function errorsOf(text: string) {
  const result = parseHistoryCsv(text, KNOWN);
  if (result.ok) throw new Error('expected the file to be rejected');
  return result.errors;
}

describe('parseHistoryCsv', () => {
  it('accepts the fixture file, duplicates included', () => {
    const vendors = parseVendorsCsv(readFileSync('fixtures/vendors.csv', 'utf8'));
    if (!vendors.ok) throw new Error('vendor fixture is invalid');

    const result = parseHistoryCsv(
      readFileSync('fixtures/invoice_history.csv', 'utf8'),
      new Set(vendors.rows.map((vendor) => vendor.vendor_code)),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.rows).toHaveLength(138);
    expect(result.rows.filter((row) => row.invoice_number === 'H-V001-001')).toHaveLength(2);
    expect(result.rows.filter((row) => row.vendor_code === 'V009')).toHaveLength(14);
  });

  it('converts a row', () => {
    const result = parseHistoryCsv(csv('V1,INV-1,2026-01-01,,1500.5,2026-01-20'), KNOWN);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.rows).toEqual([
      {
        vendor_code: 'V1',
        invoice_number: 'INV-1',
        invoice_date: '2026-01-01',
        po_number: null,
        total_amount: 1500.5,
        paid_date: '2026-01-20',
      },
    ]);
  });

  it('rejects a vendor outside the organization', () => {
    expect(errorsOf(csv('V9,INV-1,2026-01-01,PO,10,2026-01-20'))).toEqual([
      { row: 2, column: 'vendor_code', message: 'vendor_code tidak ada di master vendor' },
    ]);
  });

  it.each([
    ['V1,,2026-01-01,PO,10,2026-01-20', 'invoice_number'],
    ['V1,INV,01/01/2026,PO,10,2026-01-20', 'invoice_date'],
    ['V1,INV,2026-01-01,PO,abc,2026-01-20', 'total_amount'],
    ['V1,INV,2026-01-01,PO,0,2026-01-20', 'total_amount'],
    ['V1,INV,2026-01-01,PO,10,', 'paid_date'],
  ])('rejects %s', (row, column) => {
    expect(errorsOf(csv(row)).map((error) => error.column)).toEqual([column]);
  });

  it('rejects a file with a missing column', () => {
    expect(errorsOf('vendor_code,invoice_number\nV1,INV')[0]).toMatchObject({ row: 1 });
  });
});
