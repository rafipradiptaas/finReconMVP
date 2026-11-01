import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { isOverride, validateDecision } from '@/lib/review';
import { loadReview, openReviewSession } from '@/lib/server/review-context';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';
import { ROLES } from '@/types/domain';

const body = z.object({
  decision: z.enum(['APPROVED', 'REJECTED_BY_REVIEWER']),
  itemsTicked: z.array(z.string()).default([]),
  reason: z.string().nullish(),
});

// Every role may review (product doc section 3); lib/review decides the rest.
export const POST = withWriteContext(
  ROLES,
  async (ctx, request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!z.uuid().safeParse(id).success || !parsed.success) {
      return fail(400, 'VALIDATION_ERROR', 'Keputusan tidak valid.', parsed.error?.issues);
    }
    const { decision } = parsed.data;
    const reason = parsed.data.reason?.trim() || null;

    const review = await loadReview(ctx.db, ctx.organizationId, id);
    if (!review) return fail(404, 'NOT_FOUND', 'Match tidak ditemukan.');
    const { match, reviewMatch, requiredItems } = review;

    const result = validateDecision({
      decision,
      reason,
      itemsTicked: parsed.data.itemsTicked,
      actorId: ctx.userId,
      uploadedBy: review.uploadedBy,
      match: reviewMatch,
      requiredItems,
      duplicateDecided: review.duplicateDecided,
      matchingFailed: review.matchingFailed,
    });
    if (!result.ok) return fail(result.status, result.code, result.message, result.details);

    const session = await openReviewSession(ctx, id);
    const decidedAt = new Date().toISOString();

    // ponytail: three writes with no transaction, like every route here. The guard
    // below stops a double decision; a Postgres function would make them atomic.
    const { data: updated, error } = await ctx.db
      .from('matches')
      .update({
        review_status: decision,
        reviewed_by: ctx.userId,
        reviewed_at: decidedAt,
        review_reason: reason,
      })
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .eq('review_status', 'PENDING_REVIEW')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!updated) return fail(409, 'INVALID_TRANSITION', 'Match ini sudah diputuskan.');

    const { count, error: countError } = await ctx.db
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .eq('entity_id', review.invoice.document_id!)
      .eq('action', 'field_corrected')
      .eq('actor_user_id', ctx.userId)
      .gte('created_at', session.opened_at);
    if (countError) throw countError;

    const { error: sessionError } = await ctx.db
      .from('review_sessions')
      .update({
        decided_at: decidedAt,
        decision,
        items_ticked: result.itemsTicked,
        reason,
        fields_corrected_count: count ?? 0,
      })
      .eq('id', session.id)
      .eq('organization_id', ctx.organizationId);
    if (sessionError) throw sessionError;

    await logAudit(
      {
        entityType: 'match',
        entityId: id,
        action: 'review_decided',
        oldValue: { review_status: match.review_status, match_status: match.status },
        newValue: {
          review_status: decision,
          items_ticked: result.itemsTicked,
          override: decision === 'APPROVED' && isOverride(reviewMatch),
          anomaly_flag: match.anomaly_flag,
        },
        reason,
      },
      ctx,
    );
    return ok({ reviewStatus: decision });
  },
);
