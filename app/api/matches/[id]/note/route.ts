import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';
import { ROLES } from '@/types/domain';

const body = z.object({ note: z.string().trim().min(1) });

// Any role, on any match. The uploader may investigate; it changes no status (D7).
export const POST = withWriteContext(
  ROLES,
  async (ctx, request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!z.uuid().safeParse(id).success || !parsed.success) {
      return fail(400, 'VALIDATION_ERROR', 'Catatan wajib diisi.', parsed.error?.issues);
    }

    const { data: match, error } = await ctx.db
      .from('matches')
      .select('id')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!match) return fail(404, 'NOT_FOUND', 'Match tidak ditemukan.');

    const { note } = parsed.data;
    const { data: created, error: insertError } = await ctx.db
      .from('investigation_notes')
      .insert({ organization_id: ctx.organizationId, match_id: id, author_id: ctx.userId, note })
      .select('id')
      .single();
    if (insertError) throw insertError;

    await logAudit(
      {
        entityType: 'match',
        entityId: id,
        action: 'investigation_note_added',
        newValue: { note_id: created.id },
        reason: note,
      },
      ctx,
    );
    return ok({ id: created.id }, 201);
  },
);
