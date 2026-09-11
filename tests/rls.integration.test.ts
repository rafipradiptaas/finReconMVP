import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Proves the multi-tenant boundary against the real database: a user of
 * organization B can neither read nor write organization A's rows.
 * Product doc section 14, "Fase 1 selesai".
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);

const stamp = Date.now();
const userB = { email: `rls-b-${stamp}@finrecon.test`, password: `rls-test-${stamp}` };

describe.skipIf(!configured)('RLS: organization isolation', () => {
  let admin: SupabaseClient;
  let asUserB: SupabaseClient;
  let orgA: string;
  let orgB: string;
  let userBId: string;
  let vendorA: string;

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: orgs, error: orgError } = await admin
      .from('organizations')
      .insert([{ name: `RLS Org A ${stamp}` }, { name: `RLS Org B ${stamp}` }])
      .select('id, name');
    if (orgError) throw orgError;
    orgA = orgs!.find((o) => o.name.includes('Org A'))!.id;
    orgB = orgs!.find((o) => o.name.includes('Org B'))!.id;

    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email: userB.email,
      password: userB.password,
      email_confirm: true,
    });
    if (userError) throw userError;
    userBId = created.user.id;

    const { error: profileError } = await admin
      .from('profiles')
      .insert({ id: userBId, organization_id: orgB, role: 'admin', full_name: 'RLS User B' });
    if (profileError) throw profileError;

    const { data: vendor, error: vendorError } = await admin
      .from('vendors')
      .insert({
        organization_id: orgA,
        vendor_code: `RLS-${stamp}`,
        vendor_name: 'Vendor Org A',
        status: 'verified',
      })
      .select('id')
      .single();
    if (vendorError) throw vendorError;
    vendorA = vendor.id;

    asUserB = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await asUserB.auth.signInWithPassword(userB);
    if (signInError) throw signInError;
  });

  // Guarded per id: beforeAll may have failed halfway, and a cleanup crash
  // would otherwise hide the real failure.
  afterAll(async () => {
    if (!admin) return;
    if (orgA) await admin.from('vendors').delete().eq('organization_id', orgA);
    if (userBId) {
      await admin.from('profiles').delete().eq('id', userBId);
      await admin.auth.admin.deleteUser(userBId);
    }
    const orgs = [orgA, orgB].filter(Boolean);
    if (orgs.length) await admin.from('organizations').delete().in('id', orgs);
  });

  it('hides another organization rows from select', async () => {
    const { data, error } = await asUserB.from('vendors').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('hides another organization rows even when addressed by id', async () => {
    const { data } = await asUserB.from('vendors').select('id').eq('id', vendorA);
    expect(data).toEqual([]);
  });

  it('refuses to insert a row into another organization', async () => {
    const { error } = await asUserB
      .from('vendors')
      .insert({
        organization_id: orgA,
        vendor_code: `RLS-STOLEN-${stamp}`,
        vendor_name: 'Should not exist',
        status: 'verified',
      });
    expect(error).not.toBeNull();
  });

  it('sees only its own organization', async () => {
    const { data } = await asUserB.from('organizations').select('id');
    expect(data).toEqual([{ id: orgB }]);
  });

  it('refuses UPDATE and DELETE on audit_logs', async () => {
    // The statement-level trigger fires even when no row matches, so this
    // proves append-only without leaving a row behind (audit rows can never
    // be cleaned up again, by design).
    const nowhere = '00000000-0000-0000-0000-000000000000';

    const { error: updateError } = await asUserB
      .from('audit_logs')
      .update({ reason: 'tampered' })
      .eq('id', nowhere);
    expect(updateError).not.toBeNull();

    const { error: deleteError } = await asUserB.from('audit_logs').delete().eq('id', nowhere);
    expect(deleteError).not.toBeNull();
  });
});
