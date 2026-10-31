import { z } from 'zod';
import { VENDOR_STATUSES } from '@/types/domain';
import { parseCsv, type CsvError, type NumberedRow } from './parse';

const COLUMNS = [
  'vendor_code',
  'vendor_name',
  'npwp',
  'bank_name',
  'bank_account_number',
  'bank_account_holder',
  'status',
] as const;

const emptyToNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' || value === undefined ? null : value), schema.nullable());

// Product doc 5.1. bank_name is stored as written: section 5.1 does not give the
// full bank list, and lib/matching normalizes it for the bank veto.
const vendorRow = z.object({
  vendor_code: z.string().min(1, 'vendor_code wajib diisi'),
  vendor_name: z.string().min(1, 'vendor_name wajib diisi'),
  npwp: z
    .string()
    .transform((value) => value.replace(/[.\-\s]/g, ''))
    .pipe(z.string().regex(/^\d{15,16}$/, 'NPWP harus 15 atau 16 digit')),
  bank_name: z.string().min(1, 'bank_name wajib diisi'),
  bank_account_number: z.string().regex(/^\d+$/, 'Nomor rekening harus berisi digit saja'),
  bank_account_holder: z.string().min(1, 'bank_account_holder wajib diisi'),
  status: z.enum(VENDOR_STATUSES, { error: 'Status harus verified, unverified, atau suspended' }),
  last_verified_at: emptyToNull(z.iso.date('Tanggal harus berformat YYYY-MM-DD')),
  contact_email: emptyToNull(z.email('Format email tidak valid')),
});

export type VendorRow = z.output<typeof vendorRow>;

function checkDuplicateCodes(rows: NumberedRow<VendorRow>[]): CsvError[] {
  const seen = new Set<string>();
  const errors: CsvError[] = [];
  for (const { row, value } of rows) {
    if (seen.has(value.vendor_code)) {
      errors.push({ row, column: 'vendor_code', message: 'vendor_code ganda di dalam file' });
    }
    seen.add(value.vendor_code);
  }
  return errors;
}

export function parseVendorsCsv(text: string) {
  return parseCsv(text, COLUMNS, vendorRow, checkDuplicateCodes);
}
