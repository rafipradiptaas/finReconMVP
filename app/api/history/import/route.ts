import { logAudit } from '@/lib/audit';
import { parseHistoryCsv } from '@/lib/csv/history';
import { readCsvUpload } from '@/lib/csv/parse';
import { normalizeInvoiceNumber } from '@/lib/matching/normalize';
import { readAll } from '@/lib/server/match-document';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';

const keyOf = (vendorId: string | null, numberNormalized: string | null, date: string | null) =>
  `${vendorId}|${numberNormalized}|${date}`;

/**
 * Paid invoices from before go-live: the baseline for the anomaly check and
 * the duplicate veto. Re-importing a file adds only rows it has not seen.
 */
export const POST = withWriteContext(['admin'], async (ctx, request: Request) => {
  const text = await readCsvUpload(request);
  if (text === null) return fail(400, 'FILE_REQUIRED', 'Pilih file CSV (maksimal 5 MB).');

  const { data: vendors, error: vendorError } = await ctx.db
    .from('vendors')
    .select('id, vendor_code, vendor_name')
    .eq('organization_id', ctx.organizationId);
  if (vendorError) throw vendorError;
  const vendorByCode = new Map(vendors.map((vendor) => [vendor.vendor_code, vendor]));

  const parsed = parseHistoryCsv(text, new Set(vendorByCode.keys()));
  if (!parsed.ok) {
    return fail(400, 'CSV_INVALID', 'File ditolak. Tidak ada data yang disimpan.', {
      errors: parsed.errors,
    });
  }

  const existing = await readAll((from, to) =>
    ctx.db
      .from('invoices')
      .select('vendor_id, invoice_number_normalized, invoice_date')
      .eq('organization_id', ctx.organizationId)
      .eq('imported_history', true)
      .order('id')
      .range(from, to),
  );
  const seen = new Set(
    existing.map((row) => keyOf(row.vendor_id, row.invoice_number_normalized, row.invoice_date)),
  );

  // The date is in the key because a vendor can reuse a number: such a row is a
  // real paid invoice, and exactly what the duplicate veto must find.
  const fresh = parsed.rows.flatMap((row) => {
    const vendor = vendorByCode.get(row.vendor_code)!;
    const normalized = normalizeInvoiceNumber(row.invoice_number);
    const key = keyOf(vendor.id, normalized, row.invoice_date);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ row, vendor, normalized }];
  });

  if (fresh.length > 0) {
    const { data: invoices, error: invoiceError } = await ctx.db
      .from('invoices')
      .insert(
        fresh.map(({ row, vendor, normalized }) => ({
          organization_id: ctx.organizationId,
          vendor_id: vendor.id,
          vendor_name: vendor.vendor_name,
          invoice_number: row.invoice_number,
          invoice_number_normalized: normalized,
          invoice_date: row.invoice_date,
          po_number: row.po_number,
          total_amount: row.total_amount,
          imported_history: true,
        })),
      )
      .select('id, vendor_id, invoice_number_normalized, invoice_date');
    if (invoiceError) throw invoiceError;

    const paidDates = new Map(
      fresh.map(({ row, vendor, normalized }) => [
        keyOf(vendor.id, normalized, row.invoice_date),
        row.paid_date,
      ]),
    );

    // status is required and these were paid, so they carry FULL_MATCH with no
    // score; /matches hides them.
    const { error: matchError } = await ctx.db.from('matches').insert(
      invoices.map((invoice) => ({
        organization_id: ctx.organizationId,
        invoice_id: invoice.id,
        status: 'FULL_MATCH' as const,
        review_status: 'PAID' as const,
        paid_at: paidDates.get(
          keyOf(invoice.vendor_id, invoice.invoice_number_normalized, invoice.invoice_date),
        )!,
      })),
    );
    if (matchError) {
      // A paid invoice without its match would be skipped by the next import.
      await ctx.db
        .from('invoices')
        .delete()
        .eq('organization_id', ctx.organizationId)
        .in('id', invoices.map(({ id }) => id));
      throw matchError;
    }
  }

  const counts = { rows: parsed.rows.length, created: fresh.length, skipped: parsed.rows.length - fresh.length };
  await logAudit({ entityType: 'invoice', action: 'history_imported', newValue: counts }, ctx);
  return ok(counts);
});
