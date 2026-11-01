import Papa from 'papaparse';
import { auditQuery, parseAuditFilters } from '@/lib/audit-filters';
import { getSessionContext } from '@/lib/auth';
import { readAll } from '@/lib/server/read-all';
import { fail } from '@/lib/server/write-context';
import { createClient } from '@/lib/supabase/server';

// Admin and approver (product doc 13). It only reads, so RLS applies.
export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return fail(401, 'UNAUTHENTICATED', 'Silakan masuk terlebih dahulu.');
  if (session.role === 'ap_staff') {
    return fail(403, 'FORBIDDEN', 'Peran Anda tidak diizinkan melakukan aksi ini.');
  }

  const supabase = await createClient();
  const filters = parseAuditFilters(Object.fromEntries(new URL(request.url).searchParams));
  const rows = await readAll((from, to) => auditQuery(supabase, filters).range(from, to));

  // Audit values can quote a vendor's document, so formulas are escaped for Excel.
  const csv = Papa.unparse(
    rows.map(({ old_value, new_value, ...row }) => ({
      ...row,
      old_value: old_value === null ? '' : JSON.stringify(old_value),
      new_value: new_value === null ? '' : JSON.stringify(new_value),
    })),
    { escapeFormulae: true },
  );
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="audit-log.csv"',
    },
  });
}
