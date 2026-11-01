import { describe, expect, it } from 'vitest';
import { buildComparisons } from '@/lib/review';

const invoice = {
  vendor_name: 'PT Satu',
  npwp: '111',
  bank_name: 'Bank BCA',
  bank_account_number: '123',
  bank_account_holder: 'PT Satu',
  po_number: 'PO-1',
  invoice_date: '2026-07-21',
  subtotal: 1000,
};
const vendor = {
  vendor_name: 'PT Satu Jaya',
  npwp: '222',
  bank_name: 'BCA',
  bank_account_number: '456',
  bank_account_holder: 'PT Satu Jaya',
};
const po = { po_number: 'PO-1', po_date: '2026-07-01', total_amount: 900 };

describe('buildComparisons', () => {
  it('pairs each invoice value with vendor master or PO', () => {
    expect(buildComparisons(invoice, vendor, po)).toEqual([
      { field: 'Nama vendor', source: 'vendor', invoiceValue: 'PT Satu', masterValue: 'PT Satu Jaya' },
      { field: 'NPWP', source: 'vendor', invoiceValue: '111', masterValue: '222' },
      { field: 'Bank', source: 'vendor', invoiceValue: 'Bank BCA', masterValue: 'BCA' },
      { field: 'Nomor rekening', source: 'vendor', invoiceValue: '123', masterValue: '456' },
      { field: 'Pemilik rekening', source: 'vendor', invoiceValue: 'PT Satu', masterValue: 'PT Satu Jaya' },
      { field: 'Nomor PO', source: 'po', invoiceValue: 'PO-1', masterValue: 'PO-1' },
      { field: 'Tanggal invoice / PO', source: 'po', invoiceValue: '2026-07-21', masterValue: '2026-07-01' },
      { field: 'Subtotal / total PO', source: 'po', invoiceValue: 1000, masterValue: 900 },
    ]);
  });

  it('leaves master values null when the vendor or PO is unknown', () => {
    const rows = buildComparisons(invoice, null, null);
    expect(rows).toHaveLength(8);
    expect(rows.every(({ masterValue }) => masterValue === null)).toBe(true);
    expect(rows[0].invoiceValue).toBe('PT Satu');
  });
});
