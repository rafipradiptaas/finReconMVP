import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { auditQuery, parseAuditFilters } from '@/lib/audit-filters';
import { getSessionContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const PAGE_SIZE = 50;
const FILTERS = [
  { name: 'entity_type', label: 'Tipe entitas', type: 'text' },
  { name: 'entity_id', label: 'ID entitas', type: 'text' },
  { name: 'action', label: 'Aksi', type: 'text' },
  { name: 'from', label: 'Dari tanggal', type: 'date' },
  { name: 'to', label: 'Sampai tanggal', type: 'date' },
] as const;

const json = (value: unknown) => (value === null ? '' : JSON.stringify(value));

export default async function AuditLogPage({ searchParams }: PageProps<'/audit-log'>) {
  const params = await searchParams;
  const filters = parseAuditFilters(params);
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const session = await getSessionContext();
  const supabase = await createClient();

  const [{ data: rows, count, error }, { data: profiles }] = await Promise.all([
    auditQuery(supabase, filters).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from('profiles').select('id, full_name'),
  ]);
  const names = new Map(profiles?.map(({ id, full_name }) => [id, full_name]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const query = (extra: Record<string, string> = {}) => {
    const active = Object.entries({ ...filters, ...extra }).filter((entry): entry is [string, string] => Boolean(entry[1]));
    return new URLSearchParams(active).toString();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Audit Log</h1>
        {session?.role !== 'ap_staff' && (
          <Button asChild variant="outline">
            <a href={`/api/audit-log/export?${query()}`}>Ekspor CSV</a>
          </Button>
        )}
      </div>

      <form className="flex flex-wrap items-end gap-3">
        {FILTERS.map(({ name, label, type }) => (
          <div key={name} className="space-y-1">
            <Label htmlFor={name}>{label}</Label>
            <Input id={name} name={name} type={type} defaultValue={filters[name] ?? ''} className="w-44" />
          </div>
        ))}
        <Button type="submit">Terapkan</Button>
        <Button asChild variant="ghost">
          <Link href="/audit-log">Reset</Link>
        </Button>
      </form>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          Gagal memuat audit log.
        </p>
      )}
      {rows?.length === 0 && <p className="text-muted-foreground text-sm">Tidak ada catatan.</p>}
      {rows && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Pelaku</TableHead>
              <TableHead>Aksi</TableHead>
              <TableHead>Entitas</TableHead>
              <TableHead>Sebelum</TableHead>
              <TableHead>Sesudah</TableHead>
              <TableHead>Alasan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="align-top">
                <TableCell>{new Date(row.created_at).toLocaleString('id-ID')}</TableCell>
                <TableCell>
                  {(row.actor_user_id && names.get(row.actor_user_id)) ?? '-'} ({row.actor_role ?? '-'})
                </TableCell>
                <TableCell>{row.action}</TableCell>
                <TableCell className="whitespace-normal">
                  {row.entity_type}
                  <br />
                  <span className="text-muted-foreground text-xs">{row.entity_id}</span>
                </TableCell>
                <TableCell className="max-w-64 text-xs break-all whitespace-normal">{json(row.old_value)}</TableCell>
                <TableCell className="max-w-64 text-xs break-all whitespace-normal">{json(row.new_value)}</TableCell>
                <TableCell className="max-w-48 whitespace-normal">{row.reason}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex items-center gap-3 text-sm">
        {page > 1 && <Link href={`/audit-log?${query({ page: String(page - 1) })}`}>Sebelumnya</Link>}
        <span>
          Halaman {page} dari {pages}
        </span>
        {page < pages && <Link href={`/audit-log?${query({ page: String(page + 1) })}`}>Berikutnya</Link>}
      </div>
    </section>
  );
}
