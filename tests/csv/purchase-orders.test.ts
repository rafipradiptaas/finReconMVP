import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupPurchaseOrders, parsePurchaseOrdersCsv } from '@/lib/csv/purchase-orders';
import { parseVendorsCsv } from '@/lib/csv/vendors';

const HEADER = 'po_number,vendor_code,po_date,line_no,item_description,quantity,unit_price,currency';
const KNOWN = new Set(['V1', 'V2']);
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');

function errorsOf(text: string) {
  const result = parsePurchaseOrdersCsv(text, KNOWN);
  if (result.ok) throw new Error('expected the file to be rejected');
  return result.errors;
}

describe('parsePurchaseOrdersCsv', () => {
  it('accepts the fixture file and groups it into 12 POs', () => {
    const vendors = parseVendorsCsv(readFileSync('fixtures/vendors.csv', 'utf8'));
    if (!vendors.ok) throw new Error('vendor fixture is invalid');

    const result = parsePurchaseOrdersCsv(
      readFileSync('fixtures/purchase_orders.csv', 'utf8'),
      new Set(vendors.rows.map((vendor) => vendor.vendor_code)),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.rows).toHaveLength(19);
    expect(groupPurchaseOrders(result.rows)).toHaveLength(12);
  });

  it('groups lines by po_number', () => {
    const result = parsePurchaseOrdersCsv(
      csv('PO1,V1,2026-01-01,1,A,2,100,IDR', 'PO1,V1,2026-01-01,2,B,1.5,0,IDR', 'PO2,V2,2026-01-02,1,C,1,5,'),
      KNOWN,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));

    const [first, second] = groupPurchaseOrders(result.rows);
    expect(first).toMatchObject({ po_number: 'PO1', vendor_code: 'V1' });
    expect(first.lines).toEqual([
      { line_no: 1, item_description: 'A', quantity: 2, unit_price: 100 },
      { line_no: 2, item_description: 'B', quantity: 1.5, unit_price: 0 },
    ]);
    expect(second.currency).toBe('IDR');
  });

  it('rejects a vendor_code outside the organization', () => {
    expect(errorsOf(csv('PO1,V9,2026-01-01,1,A,1,1,IDR'))).toEqual([
      { row: 2, column: 'vendor_code', message: 'vendor_code tidak ada di master vendor' },
    ]);
  });

  it.each([
    ['0', 'quantity harus lebih dari 0'],
    ['-1', 'quantity harus lebih dari 0'],
    ['abc', 'quantity harus berupa angka'],
    ['', 'quantity wajib diisi'],
  ])('rejects quantity %j', (quantity, message) => {
    expect(errorsOf(csv(`PO1,V1,2026-01-01,1,A,${quantity},1,IDR`))[0]).toMatchObject({
      column: 'quantity',
      message,
    });
  });

  it('rejects a negative unit_price and allows zero', () => {
    expect(errorsOf(csv('PO1,V1,2026-01-01,1,A,1,-1,IDR'))[0].column).toBe('unit_price');
    expect(parsePurchaseOrdersCsv(csv('PO1,V1,2026-01-01,1,A,1,0,IDR'), KNOWN).ok).toBe(true);
  });

  it('rejects Indonesian-formatted numbers instead of misreading them', () => {
    expect(errorsOf(csv('PO1,V1,2026-01-01,1,A,1,"1.850.000",IDR'))[0].column).toBe('unit_price');
  });

  it('rejects a repeated line_no within one PO only', () => {
    expect(errorsOf(csv('PO1,V1,2026-01-01,1,A,1,1,IDR', 'PO1,V1,2026-01-01,1,B,1,1,IDR'))).toMatchObject([
      { row: 3, column: 'line_no' },
    ]);
    expect(
      parsePurchaseOrdersCsv(csv('PO1,V1,2026-01-01,1,A,1,1,IDR', 'PO2,V1,2026-01-01,1,B,1,1,IDR'), KNOWN).ok,
    ).toBe(true);
  });

  it('rejects lines of one PO that disagree on vendor, date or currency', () => {
    const errors = errorsOf(csv('PO1,V1,2026-01-01,1,A,1,1,IDR', 'PO1,V2,2026-01-02,2,B,1,1,USD'));
    expect(errors.map((error) => error.column)).toEqual(['vendor_code', 'po_date', 'currency']);
  });
});
