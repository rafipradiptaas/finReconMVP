import { z } from 'zod';
import { sendFollowup } from '@/lib/server/followups';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';
import { ROLES } from '@/types/domain';

/** A person's click. It takes no body: the recipient and the text are not the caller's to set. */
export const POST = withWriteContext(
  ROLES,
  async (ctx, _request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return fail(400, 'VALIDATION_ERROR', 'Follow-up tidak valid.');

    const result = await sendFollowup(ctx, id);
    if (!result.ok) return fail(result.status, result.code, result.message);
    return ok({ status: 'SENT', recipient: result.recipient, providerMessageId: result.providerMessageId });
  },
);
