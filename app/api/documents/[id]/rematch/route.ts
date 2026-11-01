import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { tryMatchDocument } from '@/lib/server/match-document';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';
import { isMatchingFailed, ROLES } from '@/types/domain';

/**
 * Recovers a document whose matching failed. It is not a re-evaluation button
 * (D18.5): a document with a good match is left alone, so calling this twice
 * changes nothing.
 */
export const POST = withWriteContext(
  ROLES,
  async (ctx, _request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return fail(400, 'VALIDATION_ERROR', 'Dokumen tidak valid.');
    }

    const { data: document, error } = await ctx.db
      .from('documents')
      .select('status, status_message, invoices(matches(id, review_status))')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!document) return fail(404, 'NOT_FOUND', 'Dokumen tidak ditemukan.');
    if (document.status !== 'EXTRACTED') {
      return fail(409, 'INVALID_TRANSITION', 'Dokumen ini belum bisa dicocokkan.');
    }

    // matchDocument resets review_status, so a decided match must never get here.
    const match = document.invoices?.matches;
    const stale = isMatchingFailed(document.status_message);
    if (match && (!stale || match.review_status !== 'PENDING_REVIEW')) {
      return ok({ rematched: false });
    }

    const rematched = await tryMatchDocument(ctx, id);
    await logAudit(
      { entityType: 'document', entityId: id, action: 'rematch_requested', newValue: { rematched } },
      ctx,
    );
    if (!rematched) return fail(500, 'MATCHING_FAILED', 'Matching gagal lagi. Coba beberapa saat lagi.');
    return ok({ rematched });
  },
);
