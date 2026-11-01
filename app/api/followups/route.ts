import { z } from 'zod';
import { createFollowup } from '@/lib/server/followups';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';
import { createClient } from '@/lib/supabase/server';
import { ROLES } from '@/types/domain';

const body = z.object({ matchId: z.uuid() });

// The agent runs inside the request, like extraction. There is no queue in the MVP.
export const maxDuration = 120;

export const POST = withWriteContext(ROLES, async (ctx, request: Request) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, 'VALIDATION_ERROR', 'Match tidak valid.', parsed.error.issues);

  const result = await createFollowup(ctx, await createClient(), parsed.data.matchId);
  return result.ok ? ok({ id: result.id }, 201) : fail(result.status, result.code, result.message);
});
