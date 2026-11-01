import 'server-only';
import { randomUUID } from 'node:crypto';
import { extractPdfText, MIN_TEXT_CHARS, type PdfText } from '@/lib/document-router/extract-pdf-text';
import { logAudit } from '@/lib/audit';
import {
  CHECKS_VERSION,
  documentStatus,
  invoiceValues,
  runExtractionChecks,
} from '@/lib/extraction-checks';
import { extractInvoice } from '@/lib/llm/extract-invoice';
import { llmCallsWriter } from '@/lib/llm/log-call';
import type { WriteContext } from '@/lib/server/write-context';
import type { Json } from '@/types/database.types';
import type { DocumentStatus } from '@/types/domain';

const NO_TEXT_MESSAGE =
  'PDF ini tidak punya teks yang bisa dibaca, kemungkinan hasil scan. Unggah PDF ber-teks.';
const UNREADABLE_MESSAGE = 'File PDF tidak bisa dibaca.';

const EXTRACTION_FAILURE_MESSAGES: Record<string, string> = {
  missing_api_key: 'Ekstraksi gagal: kunci API LLM belum diatur.',
  auth_rejected: 'Ekstraksi gagal: kunci API LLM ditolak provider.',
  insufficient_balance: 'Ekstraksi gagal: saldo provider LLM habis.',
  rate_limited: 'Ekstraksi gagal: provider LLM membatasi permintaan. Coba unggah lagi.',
};
const DEFAULT_FAILURE_MESSAGE = 'Ekstraksi gagal. Coba unggah lagi.';

/** Every status change is one audit row (product doc 4). */
export async function setDocumentStatus(
  ctx: WriteContext,
  documentId: string,
  from: DocumentStatus,
  to: DocumentStatus,
  statusMessage: string | null = null,
) {
  const { error } = await ctx.db
    .from('documents')
    .update({ status: to, status_message: statusMessage })
    .eq('id', documentId)
    .eq('organization_id', ctx.organizationId);
  if (error) throw error;
  await logAudit(
    {
      entityType: 'document',
      entityId: documentId,
      action: 'document_status_changed',
      oldValue: { status: from },
      newValue: { status: to, status_message: statusMessage },
    },
    ctx,
  );
}

async function readText(bytes: Uint8Array): Promise<PdfText | null> {
  try {
    return await extractPdfText(bytes);
  } catch {
    return null;
  }
}

async function extract(ctx: WriteContext, documentId: string, { fullText, items }: PdfText) {
  await setDocumentStatus(ctx, documentId, 'UPLOADED', 'EXTRACTING');

  const log = llmCallsWriter(ctx.db, ctx.organizationId, { type: 'document', id: documentId });
  const result = await extractInvoice(fullText, { log });
  if (!result.ok) {
    const message = EXTRACTION_FAILURE_MESSAGES[result.errorCode] ?? DEFAULT_FAILURE_MESSAGE;
    await setDocumentStatus(ctx, documentId, 'EXTRACTING', 'EXTRACTION_FAILED', message);
    return 'EXTRACTION_FAILED' as const;
  }

  const fields = runExtractionChecks(result.raw, { text: fullText, items });
  const organization_id = ctx.organizationId;

  const { error: extractionError } = await ctx.db.from('extractions').insert({
    organization_id,
    document_id: documentId,
    raw_json: result.raw as unknown as Json,
    fields: fields as unknown as Json,
    text_items: items as unknown as Json,
    model: result.model,
    prompt_version: result.promptVersion,
    checks_version: CHECKS_VERSION,
  });
  if (extractionError) throw extractionError;

  const { error: invoiceError } = await ctx.db
    .from('invoices')
    .insert({ ...invoiceValues(fields), organization_id, document_id: documentId });
  if (invoiceError) throw invoiceError;

  const status = documentStatus(fields);
  await logAudit(
    {
      entityType: 'document',
      entityId: documentId,
      action: 'extraction_completed',
      newValue: {
        model: result.model,
        prompt_version: result.promptVersion,
        checks_version: CHECKS_VERSION,
      },
    },
    ctx,
  );
  await setDocumentStatus(ctx, documentId, 'EXTRACTING', status);
  return status;
}

/** Upload → router → extraction → checks. An LLM failure ends in a status, never a 500. */
export async function processDocument(
  ctx: WriteContext,
  file: { bytes: Uint8Array; filename: string },
) {
  const documentId = randomUUID();
  const storagePath = `${ctx.organizationId}/${documentId}.pdf`;

  const { error: uploadError } = await ctx.db.storage
    .from('documents')
    .upload(storagePath, file.bytes, { contentType: 'application/pdf' });
  if (uploadError) throw uploadError;

  const { error: documentError } = await ctx.db.from('documents').insert({
    id: documentId,
    organization_id: ctx.organizationId,
    storage_path: storagePath,
    original_filename: file.filename,
    mime_type: 'application/pdf',
    status: 'UPLOADED',
    uploaded_by: ctx.userId,
  });
  if (documentError) throw documentError;
  await logAudit(
    {
      entityType: 'document',
      entityId: documentId,
      action: 'document_uploaded',
      newValue: { filename: file.filename },
    },
    ctx,
  );

  const text = await readText(file.bytes);
  if (!text || text.fullText.length < MIN_TEXT_CHARS) {
    const message = text ? NO_TEXT_MESSAGE : UNREADABLE_MESSAGE;
    await setDocumentStatus(ctx, documentId, 'UPLOADED', 'UNSUPPORTED_FORMAT', message);
    return { documentId, status: 'UNSUPPORTED_FORMAT' as DocumentStatus };
  }

  try {
    return { documentId, status: await extract(ctx, documentId, text) as DocumentStatus };
  } catch (error) {
    // A row must never stay stuck in EXTRACTING.
    console.error(error);
    await setDocumentStatus(ctx, documentId, 'EXTRACTING', 'EXTRACTION_FAILED', DEFAULT_FAILURE_MESSAGE);
    return { documentId, status: 'EXTRACTION_FAILED' as DocumentStatus };
  }
}
