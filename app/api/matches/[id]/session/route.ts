import { z } from 'zod';
import { reviewBlock } from '@/lib/review';
import { loadReview, openReviewSession } from '@/lib/server/review-context';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';
import { ROLES } from '@/types/domain';

/** The panel calls this when it opens, so opened_at is server time (product doc 9.4). */
export const POST = withWriteContext(
  ROLES,
  async (ctx, _request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return fail(400, 'VALIDATION_ERROR', 'Match tidak valid.');

    const review = await loadReview(ctx.db, ctx.organizationId, id);
    if (!review) return fail(404, 'NOT_FOUND', 'Match tidak ditemukan.');

    const blocked = reviewBlock({
      actorId: ctx.userId,
      uploadedBy: review.uploadedBy,
      match: review.reviewMatch,
      matchingFailed: review.matchingFailed,
    });
    if (blocked) return fail(blocked.status, blocked.code, blocked.message);

    return ok(await openReviewSession(ctx, id));
  },
);
