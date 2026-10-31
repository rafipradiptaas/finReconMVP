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
