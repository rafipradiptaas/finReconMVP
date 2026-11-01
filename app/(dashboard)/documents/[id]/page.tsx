import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DocumentReview } from '@/components/documents/document-review';
import { DocumentStatusBadge } from '@/components/documents/document-status-badge';
import type { CheckedInvoice } from '@/lib/extraction-checks';
import { createClient } from '@/lib/supabase/server';

const SIGNED_URL_SECONDS = 600;

export default async function DocumentDetailPage({ params }: PageProps<'/documents/[id]'>) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS scopes all of this to the caller's organization, the signed URL included.
  const { data: document } = await supabase
    .from('documents')
    .select('id, original_filename, status, status_message, storage_path')
    .eq('id', id)
    .maybeSingle();
  if (!document) notFound();

  const [{ data: extraction }, { data: invoice }, { data: signed }] = await Promise.all([
    supabase.from('extractions').select('fields').eq('document_id', id).maybeSingle(),
    supabase.from('invoices').select('matches(review_status)').eq('document_id', id).maybeSingle(),
    supabase.storage.from('documents').createSignedUrl(document.storage_path, SIGNED_URL_SECONDS),
  ]);

  const correctable = document.status === 'NEEDS_CORRECTION' || document.status === 'EXTRACTED';
  const reviewStatus = invoice?.matches?.review_status;
  const decided = Boolean(reviewStatus && reviewStatus !== 'PENDING_REVIEW');

  return (
    <section className="space-y-4">
      <Link href="/documents" className="text-muted-foreground text-sm underline underline-offset-4">
        Kembali ke daftar dokumen
      </Link>
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{document.original_filename}</h1>
        <DocumentStatusBadge status={document.status} />
      </div>
      {document.status_message && (
        <p className="text-muted-foreground text-sm">{document.status_message}</p>
      )}
      {document.status === 'NEEDS_CORRECTION' && (
        <p className="text-sm">
          Ada field kritis yang kosong atau belum terverifikasi. Periksa buktinya, lalu koreksi.
        </p>
      )}
      <DocumentReview
        documentId={document.id}
        pdfUrl={signed?.signedUrl ?? null}
        fields={(extraction?.fields as unknown as CheckedInvoice | undefined) ?? null}
        editable={correctable && !decided}
      />
    </section>
  );
}
