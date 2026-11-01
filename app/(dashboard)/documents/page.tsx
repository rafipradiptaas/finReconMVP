import Link from 'next/link';
import { DocumentStatusBadge } from '@/components/documents/document-status-badge';
import { UploadDropzone } from '@/components/documents/upload-dropzone';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createClient } from '@/lib/supabase/server';
import { isMatchingFailed, MATCHING_FAILED_LABEL } from '@/types/domain';

export default async function DocumentsPage() {
  const supabase = await createClient();
  const { data: documents, error } = await supabase
    .from('documents')
    .select('id, original_filename, status, status_message, created_at')
    .order('created_at', { ascending: false });

  const processing = documents?.some(({ status }) => status === 'UPLOADED' || status === 'EXTRACTING');

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Dokumen</h1>
      <UploadDropzone processing={Boolean(processing)} />

      {error && (
        <p className="text-destructive text-sm" role="alert">
          Gagal memuat dokumen.
        </p>
      )}
      {documents?.length === 0 && (
        <p className="text-muted-foreground text-sm">Belum ada dokumen. Unggah invoice PDF pertama.</p>
      )}
      {documents && documents.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Keterangan</TableHead>
              <TableHead>Diunggah</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((document) => (
              <TableRow key={document.id}>
                <TableCell>
                  <Link href={`/documents/${document.id}`} className="underline underline-offset-4">
                    {document.original_filename}
                  </Link>
                </TableCell>
                <TableCell>
                  <DocumentStatusBadge status={document.status} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  {isMatchingFailed(document.status_message)
                    ? MATCHING_FAILED_LABEL
                    : (document.status_message ?? '-')}
                </TableCell>
                <TableCell>{new Date(document.created_at).toLocaleString('id-ID')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
