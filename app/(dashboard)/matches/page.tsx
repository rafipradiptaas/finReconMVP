import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { pendingDuplicateInvoices } from '@/lib/matching';
import { createClient } from '@/lib/supabase/server';
import {
  MATCH_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  VETO_LABELS,
  type MatchStatus,
} from '@/types/domain';

const VARIANTS: Record<MatchStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  FULL_MATCH: 'default',
  PARTIAL_MATCH: 'secondary',
  NO_MATCH: 'outline',
  REJECTED: 'destructive',
};

export default async function MatchesPage() {
  const supabase = await createClient();
  const { data: matches, error } = await supabase
    .from('matches')
    .select(
      'id, status, veto_code, score, anomaly_flag, anomaly_reason, review_status, invoices!inner(id, document_id, vendor_id, vendor_name, invoice_number, invoice_number_normalized, total_amount, imported_history)',
    )
    .eq('invoices.imported_history', false)
    .order('created_at', { ascending: false });

  const duplicates = pendingDuplicateInvoices(
    (matches ?? []).map(({ review_status, invoices }) => ({
      invoice_id: invoices.id,
      vendor_id: invoices.vendor_id,
      invoice_number_normalized: invoices.invoice_number_normalized,
      review_status,
    })),
  );

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Pencocokan</h1>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          Gagal memuat hasil pencocokan.
        </p>
      )}
      {matches?.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Belum ada hasil. Invoice yang terekstraksi otomatis dicocokkan.
        </p>
      )}
      {matches && matches.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Skor</TableHead>
              <TableHead>Catatan</TableHead>
              <TableHead>Review</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.map((match) => (
              <TableRow key={match.id}>
                <TableCell>
                  <Link
                    href={`/documents/${match.invoices.document_id}`}
                    className="underline underline-offset-4"
                  >
                    {match.invoices.invoice_number ?? '-'}
                  </Link>
                </TableCell>
                <TableCell>{match.invoices.vendor_name ?? '-'}</TableCell>
                <TableCell className="text-right">
                  {match.invoices.total_amount?.toLocaleString('id-ID') ?? '-'}
                </TableCell>
                <TableCell>
                  <Badge variant={VARIANTS[match.status]}>{MATCH_STATUS_LABELS[match.status]}</Badge>
                </TableCell>
                <TableCell className="text-right">{match.score ?? '-'}</TableCell>
                <TableCell className="space-y-1 whitespace-normal">
                  {match.veto_code && <p>{VETO_LABELS[match.veto_code]}</p>}
                  {match.anomaly_flag && (
                    <p title={match.anomaly_reason ?? undefined}>
                      <Badge variant="destructive">Anomali</Badge>
                    </p>
                  )}
                  {duplicates.has(match.invoices.id) && (
                    <p className="flex items-center gap-1 text-sm">
                      <TriangleAlert className="size-4" aria-hidden />
                      Ada invoice sama yang menunggu review
                    </p>
                  )}
                </TableCell>
                <TableCell>{REVIEW_STATUS_LABELS[match.review_status]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
