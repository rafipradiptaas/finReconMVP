import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';

// Approver only: admin cannot mark PAID (D22).
export const POST = withWriteContext(
  ['approver'],
  async (ctx, _request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return fail(400, 'VALIDATION_ERROR', 'Match tidak valid.');

    const { data: match, error } = await ctx.db
      .from('matches')
      .select('id')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!match) return fail(404, 'NOT_FOUND', 'Match tidak ditemukan.');

    const { data: updated, error: updateError } = await ctx.db
      .from('matches')
      .update({
        review_status: 'PAID',
        paid_marked_by: ctx.userId,
        paid_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .eq('review_status', 'APPROVED')
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return fail(409, 'INVALID_TRANSITION', 'Hanya match yang disetujui bisa ditandai dibayar.');

    await logAudit(
      {
        entityType: 'match',
        entityId: id,
        action: 'match_marked_paid',
        oldValue: { review_status: 'APPROVED' },
        newValue: { review_status: 'PAID' },
      },
      ctx,
    );
    return ok({ reviewStatus: 'PAID' });
  },
);
