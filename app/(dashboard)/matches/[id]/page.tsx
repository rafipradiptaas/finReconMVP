import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { DocumentReview } from '@/components/documents/document-review';
import { RematchButton } from '@/components/documents/rematch-button';
import { MatchStatusBadge } from '@/components/matches/match-status-badge';
import { ReviewActions } from '@/components/matches/review-actions';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getSessionContext } from '@/lib/auth';
import { buildComparisons, correctionLock } from '@/lib/review';
import { loadReview } from '@/lib/server/review-context';
import { createClient } from '@/lib/supabase/server';
import { REVIEW_STATUS_LABELS, VETO_LABELS } from '@/types/domain';

const SIGNED_URL_SECONDS = 600;

const COMPONENT_LABELS = {
  po_number: 'Nomor PO',
  vendor_name: 'Nama vendor',
  amount: 'Nominal',
  line_items: 'Baris item',
  consistency: 'Konsistensi',
} as const;

const display = (value: string | number | null) =>
  value === null ? '-' : typeof value === 'number' ? value.toLocaleString('id-ID') : value;

export default async function MatchDetailPage({ params }: PageProps<'/matches/[id]'>) {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session || !z.uuid().safeParse(id).success) notFound();

  // RLS scopes every read here to the caller's organization.
  const supabase = await createClient();
  const review = await loadReview(supabase, session.organizationId, id);
  if (!review?.document) notFound();
  const { match, reviewMatch, invoice, document } = review;

  const [{ data: vendor }, { data: po }, { data: notes }, { data: signed }] = await Promise.all([
    invoice.vendor_id
      ? supabase
          .from('vendors')
          .select('vendor_name, npwp, bank_name, bank_account_number, bank_account_holder')
          .eq('id', invoice.vendor_id)
          .maybeSingle()
      : { data: null },
    invoice.po_id
      ? supabase
          .from('purchase_orders')
          .select('po_number, po_date, total_amount')
          .eq('id', invoice.po_id)
          .maybeSingle()
      : { data: null },
    supabase
      .from('investigation_notes')
      .select('id, note, created_at, profiles(full_name)')
      .eq('match_id', id)
      .order('created_at', { ascending: false }),
    supabase.storage.from('documents').createSignedUrl(document.storage_path, SIGNED_URL_SECONDS),
  ]);

  const breakdown = reviewMatch.score_breakdown;

  return (
    <section className="space-y-4">
      <Link href="/matches" className="text-muted-foreground text-sm underline underline-offset-4">
        Kembali ke daftar pencocokan
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{invoice.invoice_number ?? document.original_filename}</h1>
        <MatchStatusBadge status={match.status} />
        {match.anomaly_flag && <Badge variant="destructive">Anomali</Badge>}
        {match.status !== 'REJECTED' && <Badge variant="outline">{REVIEW_STATUS_LABELS[match.review_status]}</Badge>}
        {!correctionLock(match) && (
          <Link href={`/documents/${document.id}`} className="text-sm underline underline-offset-4">
            Buka dokumen untuk koreksi
          </Link>
        )}
      </div>
      {review.matchingFailed && <RematchButton documentId={document.id} />}

      <DocumentReview documentId={document.id} pdfUrl={signed?.signedUrl ?? null} fields={review.fields} editable={false}>
        {match.veto_code && (
          <p className="text-destructive font-medium" role="alert">
            Veto: {VETO_LABELS[match.veto_code]}
          </p>
        )}
        {match.anomaly_reason && (
          <p className="flex items-start gap-2 text-sm" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {match.anomaly_reason}
          </p>
        )}
        {review.pendingTwin && (
          <p className="flex items-start gap-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            Ada invoice lain dengan nomor dan vendor yang sama yang menunggu review.
          </p>
        )}
        {match.explanation && (
          <div className="bg-muted space-y-1 rounded-lg p-3 text-sm">
            <Badge variant="secondary">Dibuat AI</Badge>
            <p>{match.explanation}</p>
          </div>
        )}

        <div className="space-y-2">
          <h2 className="font-medium">Invoice vs master vendor vs PO</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Master vendor</TableHead>
                <TableHead>PO</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buildComparisons(invoice, vendor, po).map(({ field, source, invoiceValue, masterValue }) => (
                <TableRow key={field}>
                  <TableCell>{field}</TableCell>
                  <TableCell className="whitespace-normal">{display(invoiceValue)}</TableCell>
                  <TableCell className="whitespace-normal">{source === 'vendor' ? display(masterValue) : ''}</TableCell>
                  <TableCell className="whitespace-normal">{source === 'po' ? display(masterValue) : ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {breakdown && (
          <div className="space-y-2">
            <h2 className="font-medium">Skor {match.score}</h2>
            {(Object.keys(COMPONENT_LABELS) as (keyof typeof COMPONENT_LABELS)[]).map((name) => (
              <div key={name} className="grid grid-cols-[8rem_1fr_4rem] items-center gap-2 text-sm">
                <span>{COMPONENT_LABELS[name]}</span>
                <progress className="h-2 w-full" value={breakdown[name].value} max={breakdown[name].max} />
                <span className="text-right">
                  {breakdown[name].value.toLocaleString('id-ID')}/{breakdown[name].max}
                </span>
              </div>
            ))}
          </div>
        )}

        {match.review_reason && (
          <p className="text-sm">
            Alasan keputusan: <span className="whitespace-pre-wrap">{match.review_reason}</span>
          </p>
        )}

        <ReviewActions
          matchId={match.id}
          match={reviewMatch}
          requiredItems={review.requiredItems}
          actorId={session.userId}
          role={session.role}
          uploadedBy={review.uploadedBy}
          duplicateDecided={review.duplicateDecided}
          matchingFailed={review.matchingFailed}
        />

        {notes && notes.length > 0 && (
          <ul className="space-y-2 text-sm">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg border p-3">
                <p className="whitespace-pre-wrap">{note.note}</p>
                <p className="text-muted-foreground text-xs">
                  {note.profiles.full_name ?? '-'}, {new Date(note.created_at).toLocaleString('id-ID')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DocumentReview>
    </section>
  );
}
