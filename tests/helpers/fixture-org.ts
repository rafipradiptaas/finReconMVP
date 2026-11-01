import type { SupabaseClient } from '@supabase/supabase-js';

// Audit rows can never be deleted, and neither can an organization that has
// them, so this one is permanent. Tests that write data use it and delete the
// rows they created by id; they never touch Demo Corp (decision D22).
const FIXTURE_ORG = 'RLS Audit Fixture (do not delete)';

export async function fixtureOrgId(admin: SupabaseClient): Promise<string> {
  const { data: rows, error } = await admin
    .from('organizations')
    .select('id')
    .eq('name', FIXTURE_ORG)
    .order('created_at')
    .limit(1);
  if (error) throw error;
  if (rows[0]) return rows[0].id;

  const { data, error: insertError } = await admin
    .from('organizations')
    .insert({ name: FIXTURE_ORG })
    .select('id')
    .single();
  if (insertError) throw insertError;
  return data.id;
}

const FIXTURE_REVIEWER = 'fixture-reviewer@finrecon.test';

/** For a test that needs a real audit row: a user with one can never be deleted (D21). */
export async function fixtureReviewerId(admin: SupabaseClient, organizationId: string): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((user) => user.email === FIXTURE_REVIEWER);
  if (existing) return existing.id;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: FIXTURE_REVIEWER,
    email_confirm: true,
  });
  if (createError) throw createError;
  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: created.user.id, organization_id: organizationId, role: 'approver' });
  if (profileError) throw profileError;
  return created.user.id;
}
