import { createClient } from '@/lib/supabase/server';
import type { Role } from '@/types/domain';

export type SessionContext = {
  userId: string;
  organizationId: string;
  role: Role;
  fullName: string | null;
};

/**
 * The only place organization_id is resolved. It always comes from the
 * server session — never from a request body, query string or tool argument.
 *
 * Returns null when there is no valid session, or when the signed-in user has
 * no profile yet (self-registered users are linked to an organization by an
 * admin; see supabase/seed.sql).
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();

  // getClaims verifies the JWT signature; getSession is not safe here.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role, full_name')
    .eq('id', userId)
    .single();

  if (!profile) return null;

  return {
    userId,
    organizationId: profile.organization_id as string,
    role: profile.role as Role,
    fullName: (profile.full_name as string | null) ?? null,
  };
}
