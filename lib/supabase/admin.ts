import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

/**
 * Service-role client. It BYPASSES RLS.
 *
 * Every query made with it must filter by organization_id explicitly — the
 * database will not do it for you (CLAUDE.md, "Data access rules"). Reads use
 * the request-scoped client from ./server.ts. Writes get this client through
 * lib/server/write-context.ts, which checks the session and role first (D21).
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
