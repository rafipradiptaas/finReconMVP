import Papa from 'papaparse';
import type { z } from 'zod';

/** `row` is the line number in the file; the header is row 1. */
export type CsvError = { row: number; column: string; message: string };
export type CsvResult<T> = { ok: true; rows: T[] } | { ok: false; errors: CsvError[] };
export type NumberedRow<T> = { row: number; value: T };

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Validates every row and reports every problem, so the user can fix a file in
 * one pass. Any error rejects the whole file. `checkRows` receives the rows that
 * passed the schema, for rules that span rows.
 */
export function parseCsv<S extends z.ZodType>(
  text: string,
  requiredColumns: readonly string[],
  schema: S,
  checkRows: (rows: NumberedRow<z.output<S>>[]) => CsvError[] = () => [],
): CsvResult<z.output<S>> {
  const parsed = Papa.parse<Record<string, string | undefined>>(text, {
    header: true,
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const missing = requiredColumns.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    return {
      ok: false,
      errors: missing.map((column) => ({ row: 1, column, message: 'Kolom tidak ditemukan' })),
    };
  }

  const errors: CsvError[] = [];
  const rows: NumberedRow<z.output<S>>[] = [];
  const shapeErrors = new Map(parsed.errors.map((error) => [error.row, error.message]));

  parsed.data.forEach((raw, index) => {
    if (Object.values(raw).every((value) => !value)) return; // blank line

    const row = index + 2;
    if (shapeErrors.has(index)) {
      errors.push({ row, column: '', message: 'Jumlah kolom tidak sesuai header' });
      return;
    }

    const result = schema.safeParse(raw);
    if (result.success) {
      rows.push({ row, value: result.data });
    } else {
      for (const issue of result.error.issues) {
        errors.push({ row, column: String(issue.path[0] ?? ''), message: issue.message });
      }
    }
  });

  errors.push(...checkRows(rows));
  if (errors.length > 0) {
    return { ok: false, errors: errors.sort((a, b) => a.row - b.row) };
  }
  if (rows.length === 0) {
    return { ok: false, errors: [{ row: 1, column: '', message: 'File tidak berisi data' }] };
  }
  return { ok: true, rows: rows.map((row) => row.value) };
}

/** Reads the `file` field of a multipart upload; null when absent or too large. */
export async function readCsvUpload(request: Request): Promise<string | null> {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_UPLOAD_BYTES) return null;
  return file.text();
}
