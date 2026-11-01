import { z } from 'zod';
import { parseCsv } from './parse';

const COLUMNS = [
  'vendor_code',
  'invoice_number',
  'invoice_date',
  'po_number',
  'total_amount',
  'paid_date',
] as const;

const date = z.iso.date('Tanggal harus berformat YYYY-MM-DD');

// Dev guide Phase 8 step 13. One row per invoice already paid before go-live.
function historyRow(knownVendorCodes: ReadonlySet<string>) {
  return z.object({
    vendor_code: z
      .string()
      .refine((code) => knownVendorCodes.has(code), 'vendor_code tidak ada di master vendor'),
    invoice_number: z.string().min(1, 'invoice_number wajib diisi'),
    invoice_date: date,
    po_number: z.string().transform((value) => value || null),
    total_amount: z
      .string()
      .min(1, 'total_amount wajib diisi')
      .transform(Number)
      .pipe(z.number('total_amount harus berupa angka').positive('total_amount harus lebih dari 0')),
    paid_date: date,
  });
}

export type HistoryRow = z.output<ReturnType<typeof historyRow>>;

export function parseHistoryCsv(text: string, knownVendorCodes: ReadonlySet<string>) {
  return parseCsv(text, COLUMNS, historyRow(knownVendorCodes));
}
