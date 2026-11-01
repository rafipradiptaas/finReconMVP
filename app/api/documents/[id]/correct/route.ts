import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import {
  applyCorrections,
  documentStatus,
  invoiceValues,
  textFromItems,
  type CheckedInvoice,
  type Corrections,
  type TextItem,
} from '@/lib/extraction-checks';
import { correctionsSchema } from '@/lib/extraction-checks/corrections';
import { matchDocument } from '@/lib/server/match-document';
import { setDocumentStatus } from '@/lib/server/process-document';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';
import type { Json } from '@/types/database.types';
import { ROLES } from '@/types/domain';

const body = z.object({ corrections: correctionsSchema });

// Every role may correct a field (product doc section 3).
export const POST = withWriteContext(
  ROLES,
  async (ctx, request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!z.uuid().safeParse(id).success || !parsed.success) {
      return fail(400, 'VALIDATION_ERROR', 'Koreksi tidak valid.', parsed.error?.issues);
    }
    const corrections = parsed.data.corrections as Corrections;

    const { data: document, error: documentError } = await ctx.db
      .from('documents')
      .select('status')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (documentError) throw documentError;
    if (!document) return fail(404, 'NOT_FOUND', 'Dokumen tidak ditemukan.');
    if (document.status !== 'NEEDS_CORRECTION' && document.status !== 'EXTRACTED') {
      return fail(409, 'INVALID_TRANSITION', 'Dokumen ini tidak punya hasil ekstraksi untuk dikoreksi.');
    }

    const { data: extraction, error: extractionError } = await ctx.db
      .from('extractions')
      .select('id, fields, text_items')
      .eq('document_id', id)
      .eq('organization_id', ctx.organizationId)
      .single();
    if (extractionError) throw extractionError;

    const { data: invoice, error: invoiceError } = await ctx.db
      .from('invoices')
      .select('id, matches(review_status)')
      .eq('document_id', id)
      .eq('organization_id', ctx.organizationId)
      .single();
    if (invoiceError) throw invoiceError;

    // A decided invoice cannot change under its decision (no backward transitions).
    const reviewStatus = invoice.matches?.review_status;
    if (reviewStatus && reviewStatus !== 'PENDING_REVIEW') {
      return fail(409, 'INVALID_TRANSITION', 'Invoice ini sudah diputuskan dan tidak bisa dikoreksi.');
    }

    const before = extraction.fields as unknown as CheckedInvoice;
    const text = textFromItems(extraction.text_items as unknown as TextItem[]);
    const fields = applyCorrections(before, corrections, text);
    const status = documentStatus(fields);

    // A document never moves back to NEEDS_CORRECTION once it has been matched.
    if (document.status === 'EXTRACTED' && status === 'NEEDS_CORRECTION') {
      return fail(
        400,
        'CORRECTION_INCONSISTENT',
        'Koreksi membuat field kritis tidak konsisten. Periksa kembali nominalnya.',
      );
    }

    const { error: fieldsError } = await ctx.db
      .from('extractions')
      .update({ fields: fields as unknown as Json })
      .eq('id', extraction.id)
      .eq('organization_id', ctx.organizationId);
    if (fieldsError) throw fieldsError;

    const { error: valuesError } = await ctx.db
      .from('invoices')
      .update(invoiceValues(fields))
      .eq('id', invoice.id)
      .eq('organization_id', ctx.organizationId);
    if (valuesError) throw valuesError;

    await logAudit(
      Object.entries(corrections).map(([field, value]) => ({
        entityType: 'document',
        entityId: id,
        action: 'field_corrected',
        oldValue: { field, value: before[field as keyof Corrections].value },
        newValue: { field, value },
      })),
      ctx,
    );

    if (status !== document.status) {
      await setDocumentStatus(ctx, id, document.status, status);
    }
    // A correction can change the outcome, so every EXTRACTED document is matched again.
    if (status === 'EXTRACTED') await matchDocument(ctx, id);
    return ok({ status });
  },
);
