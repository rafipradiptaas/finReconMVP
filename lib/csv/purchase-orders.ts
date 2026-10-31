import { z } from 'zod';
import { parseCsv, type CsvError, type NumberedRow } from './parse';

const COLUMNS = [
  'po_number',
  'vendor_code',
  'po_date',
  'line_no',
  'item_description',
  'quantity',
  'unit_price',
] as const;

const number = (column: string) =>
  z.string().min(1, `${column} wajib diisi`).transform(Number);

// Product doc 5.2. One row per line item.
function poRow(knownVendorCodes: ReadonlySet<string>) {
  return z.object({
    po_number: z.string().min(1, 'po_number wajib diisi'),
    vendor_code: z
      .string()
      .refine((code) => knownVendorCodes.has(code), 'vendor_code tidak ada di master vendor'),
    po_date: z.iso.date('Tanggal harus berformat YYYY-MM-DD'),
    line_no: number('line_no').pipe(
      z.int('line_no harus bilangan bulat').positive('line_no harus lebih dari 0'),
    ),
    item_description: z.string().min(1, 'item_description wajib diisi'),
    quantity: number('quantity').pipe(
      z.number('quantity harus berupa angka').positive('quantity harus lebih dari 0'),
    ),
    unit_price: number('unit_price').pipe(
      z.number('unit_price harus berupa angka').nonnegative('unit_price tidak boleh negatif'),
    ),
    currency: z.string().optional().transform((value) => value || 'IDR'),
  });
}

export type PoRow = z.output<ReturnType<typeof poRow>>;

export type GroupedPo = Pick<PoRow, 'po_number' | 'vendor_code' | 'po_date' | 'currency'> & {
  lines: Pick<PoRow, 'line_no' | 'item_description' | 'quantity' | 'unit_price'>[];
};

function checkAcrossRows(rows: NumberedRow<PoRow>[]): CsvError[] {
  const errors: CsvError[] = [];
  const first = new Map<string, PoRow>();
  const lines = new Set<string>();

  for (const { row, value } of rows) {
    const lineKey = `${value.po_number}#${value.line_no}`;
    if (lines.has(lineKey)) {
      errors.push({ row, column: 'line_no', message: 'line_no ganda untuk PO ini' });
    }
    lines.add(lineKey);

    const header = first.get(value.po_number);
    if (!header) {
      first.set(value.po_number, value);
      continue;
    }
    for (const column of ['vendor_code', 'po_date', 'currency'] as const) {
      if (value[column] !== header[column]) {
        errors.push({ row, column, message: `${column} berbeda dari baris lain PO ini` });
      }
    }
  }
  return errors;
}

export function parsePurchaseOrdersCsv(text: string, knownVendorCodes: ReadonlySet<string>) {
  return parseCsv(text, COLUMNS, poRow(knownVendorCodes), checkAcrossRows);
}

export function groupPurchaseOrders(rows: PoRow[]): GroupedPo[] {
  const groups = new Map<string, GroupedPo>();
  for (const { po_number, vendor_code, po_date, currency, ...line } of rows) {
    const group = groups.get(po_number) ?? { po_number, vendor_code, po_date, currency, lines: [] };
    group.lines.push(line);
    groups.set(po_number, group);
  }
  return [...groups.values()];
}
