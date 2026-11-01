import { z } from 'zod';
import { updateFollowup } from '@/lib/server/followups';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';
import { ROLES } from '@/types/domain';

const body = z.union([
  z.strictObject({ discard: z.literal(true) }),
  z
    .strictObject({ subject: z.string().trim().min(1).optional(), body: z.string().trim().min(1).optional() })
    .refine((change) => change.subject !== undefined || change.body !== undefined),
]);

export const PATCH = withWriteContext(
  ROLES,
  async (ctx, request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!z.uuid().safeParse(id).success || !parsed.success) {
      return fail(400, 'VALIDATION_ERROR', 'Perubahan tidak valid.', parsed.error?.issues);
    }
    const result = await updateFollowup(ctx, id, parsed.data);
    return result.ok ? ok({ id }) : fail(result.status, result.code, result.message);
  },
);
