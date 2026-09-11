import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. It BYPASSES RLS.
 *
 * Every query made with it must filter by organization_id explicitly — the
 * database will not do it for you (CLAUDE.md, "Data access rules"). Use the
 * request-scoped client from ./server.ts unless you genuinely need to cross
 * user boundaries (imports, seeding, background work).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
