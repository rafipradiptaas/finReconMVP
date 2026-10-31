import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';
import { ROLES, VENDOR_STATUSES } from '@/types/domain';

const body = z.object({ status: z.enum(VENDOR_STATUSES) });

// Every role may change vendor status (product doc section 3, D21).
export const PATCH = withWriteContext(
  ROLES,
  async (ctx, request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!z.uuid().safeParse(id).success || !parsed.success) {
      return fail(400, 'VALIDATION_ERROR', 'Status vendor tidak valid.');
    }

    const { data: vendor, error: readError } = await ctx.db
      .from('vendors')
      .select('status')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (readError) throw readError;
    if (!vendor) return fail(404, 'NOT_FOUND', 'Vendor tidak ditemukan.');

    if (vendor.status === parsed.data.status) return ok({ status: vendor.status });

    const { error: writeError } = await ctx.db
      .from('vendors')
      .update({ status: parsed.data.status })
      .eq('id', id)
      .eq('organization_id', ctx.organizationId);
    if (writeError) throw writeError;

    await logAudit(
      {
        entityType: 'vendor',
        entityId: id,
        action: 'vendor_status_changed',
        oldValue: { status: vendor.status },
        newValue: { status: parsed.data.status },
      },
      ctx,
    );

    return ok({ status: parsed.data.status });
  },
);
