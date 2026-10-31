import 'server-only';
import { NextResponse } from 'next/server';
import { getSessionContext, type SessionContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Role } from '@/types/domain';

export type WriteContext = SessionContext & {
  /** Service role: bypasses RLS, so every query must filter organizationId. */
  db: ReturnType<typeof createAdminClient>;
};

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

/**
 * The only way a route gets write access (decision D21). anon and authenticated
 * are read-only in the database, so a route handler wrapped here is the single
 * path to a write: session verified, role checked from profiles, then the
 * handler runs with a service-role client. organization_id comes from the
 * session, never from the request.
 */
export function withWriteContext<Args extends unknown[]>(
  roles: readonly Role[],
  handler: (ctx: WriteContext, ...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    const session = await getSessionContext();
    if (!session) return fail(401, 'UNAUTHENTICATED', 'Silakan masuk terlebih dahulu.');
    if (!roles.includes(session.role)) {
      return fail(403, 'FORBIDDEN', 'Peran Anda tidak diizinkan melakukan aksi ini.');
    }

    try {
      return await handler({ ...session, db: createAdminClient() }, ...args);
    } catch (error) {
      console.error(error);
      return fail(500, 'INTERNAL_ERROR', 'Terjadi kesalahan di server.');
    }
  };
}
