import { z } from 'zod';
import { normalizeDate, normalizeDigits, normalizeText } from './normalize';
import { formatOk } from './signals';

const text = z.string().transform(normalizeText).pipe(z.string().min(1, 'wajib diisi'));
const money = z.number().min(0, 'tidak boleh negatif');

const digits = (field: string, message: string) =>
  z
    .string()
    .refine((value) => formatOk(field, value) === true, message)
    .transform(normalizeDigits);

const date = z
  .string()
  .transform((value) => normalizeDate(value))
  .refine((value) => value !== null, 'tanggal tidak valid');

/** Line items are not editable in the MVP, and any other key is refused. */
export const correctionsSchema = z
  .strictObject({
    invoice_number: text.nullable(),
    invoice_date: date.nullable(),
    vendor_name: text.nullable(),
    npwp: digits('npwp', 'NPWP harus 15 atau 16 digit').nullable(),
    po_number: text.nullable(),
    bank_name: text.nullable(),
    bank_account_number: digits('bank_account_number', 'Nomor rekening harus 6-20 digit').nullable(),
    bank_account_holder: text.nullable(),
    subtotal: money.nullable(),
    tax_amount: money.nullable(),
    total_amount: money.nullable(),
  })
  .partial()
  .refine((corrections) => Object.keys(corrections).length > 0, 'Tidak ada field yang diubah.');
