import { z } from 'zod';
import { addReply } from '@/lib/server/followups';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';
import { createClient } from '@/lib/supabase/server';
import { ROLES } from '@/types/domain';

const MAX_REPLY_CHARS = 20_000;
const payload = z.object({ body: z.string().trim().min(1).max(MAX_REPLY_CHARS) });

export const maxDuration = 120;

export const POST = withWriteContext(
  ROLES,
  async (ctx, request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const parsed = payload.safeParse(await request.json().catch(() => null));
    if (!z.uuid().safeParse(id).success || !parsed.success) {
      return fail(400, 'VALIDATION_ERROR', 'Balasan wajib diisi.', parsed.error?.issues);
    }
    const result = await addReply(ctx, await createClient(), id, parsed.data.body);
    return result.ok ? ok(result.reply, 201) : fail(result.status, result.code, result.message);
  },
);
