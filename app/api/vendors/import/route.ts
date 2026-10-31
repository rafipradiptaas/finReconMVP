import { logAudit, type AuditEntry } from '@/lib/audit';
import { readCsvUpload } from '@/lib/csv/parse';
import { parseVendorsCsv } from '@/lib/csv/vendors';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';

// Changes to these are audited with old and new values (product doc 5.1).
const AUDITED_FIELDS = [
  'status',
  'bank_name',
  'bank_account_number',
  'bank_account_holder',
  'contact_email',
] as const;

export const POST = withWriteContext(['admin'], async (ctx, request: Request) => {
  const text = await readCsvUpload(request);
  if (text === null) return fail(400, 'FILE_REQUIRED', 'Pilih file CSV (maksimal 5 MB).');

  const parsed = parseVendorsCsv(text);
  if (!parsed.ok) {
    return fail(400, 'CSV_INVALID', 'File ditolak. Tidak ada data yang disimpan.', {
      errors: parsed.errors,
    });
  }

  const { data: existing, error: readError } = await ctx.db
    .from('vendors')
    .select(`id, vendor_code, ${AUDITED_FIELDS.join(', ')}`)
    .eq('organization_id', ctx.organizationId)
    .in('vendor_code', parsed.rows.map((row) => row.vendor_code));
  if (readError) throw readError;

  const before = new Map(
    (existing as unknown as (Record<(typeof AUDITED_FIELDS)[number], string | null> & {
      id: string;
      vendor_code: string;
    })[]).map((vendor) => [vendor.vendor_code, vendor]),
  );

  const { error: writeError } = await ctx.db
    .from('vendors')
    .upsert(
      parsed.rows.map((row) => ({ ...row, organization_id: ctx.organizationId })),
      { onConflict: 'organization_id,vendor_code' },
    );
  if (writeError) throw writeError;

  const changes: AuditEntry[] = [];
  for (const row of parsed.rows) {
    const old = before.get(row.vendor_code);
    if (!old) continue;

    const changed = AUDITED_FIELDS.filter((field) => old[field] !== row[field]);
    if (changed.length === 0) continue;
    changes.push({
      entityType: 'vendor',
      entityId: old.id,
      action: 'vendor_changed_by_import',
      oldValue: Object.fromEntries(changed.map((field) => [field, old[field]])),
      newValue: Object.fromEntries(changed.map((field) => [field, row[field]])),
    });
  }

  const counts = {
    rows: parsed.rows.length,
    created: parsed.rows.length - before.size,
    updated: before.size,
    changed: changes.length,
  };
  // ponytail: write and audit are separate statements, so an audit failure
  // returns 500 after the upsert landed. Wrap both in one Postgres function if
  // that ever happens in practice.
  await logAudit(
    [{ entityType: 'vendor', action: 'vendors_imported', newValue: counts }, ...changes],
    ctx,
  );

  return ok(counts);
});
