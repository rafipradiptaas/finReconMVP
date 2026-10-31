import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureOrgId } from './helpers/fixture-org';

/**
 * Proves the permission model against the real database (decision D21): no
 * user sees another organization's rows, and the public anon key can read but
 * never write, on every table. Run with 0002_v3.sql applied.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);

const INSUFFICIENT_PRIVILEGE = '42501';
const NOWHERE = '00000000-0000-0000-0000-000000000000';

const ORG_TABLES = [
  'profiles',
  'vendors',
  'purchase_orders',
  'purchase_order_lines',
  'documents',
  'extractions',
  'invoices',
  'matches',
  'investigation_notes',
  'review_sessions',
  'followups',
  'followup_replies',
  'llm_calls',
  'audit_logs',
] as const;

const stamp = Date.now();
const userA = { email: `rls-a-${stamp}@finrecon.test`, password: `rls-test-a-${stamp}` };
const userB = { email: `rls-b-${stamp}@finrecon.test`, password: `rls-test-b-${stamp}` };

const options = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!configured)('database permissions', () => {
  let admin: SupabaseClient;
  let asUserA: SupabaseClient;
  let asUserB: SupabaseClient;
  let orgA: string;
  let orgB: string;
  let userAId: string;
  let userBId: string;
  let vendorA: string;
  let poA: string;
  let documentA: string;
  let matchA: string;

  // The fixture organization is shared with other test files, so cleanup goes
  // by the ids this run created.
  const created: Record<string, string[]> = {};

  async function insertOne(table: string, row: Record<string, unknown>): Promise<string> {
    const { data, error } = await admin.from(table).insert(row).select('id').single();
    if (error) throw new Error(`seed ${table}: ${error.message}`);
    (created[table] ??= []).push(data.id);
    return data.id;
  }

  async function signIn(credentials: typeof userA) {
    const client = createClient(url!, anonKey!, options);
    const { error } = await client.auth.signInWithPassword(credentials);
    if (error) throw error;
    return client;
  }

  async function createMember(credentials: typeof userA, organizationId: string) {
    const { data, error } = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
    if (error) throw error;
    const { error: profileError } = await admin
      .from('profiles')
      .insert({ id: data.user.id, organization_id: organizationId, role: 'ap_staff', full_name: 'RLS' });
    if (profileError) throw profileError;
    return data.user.id;
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, options);

    orgA = await fixtureOrgId(admin);
    orgB = await insertOne('organizations', { name: `RLS Org B ${stamp}` });
    userAId = await createMember(userA, orgA);
    userBId = await createMember(userB, orgB);

    const organization_id = orgA;
    vendorA = await insertOne('vendors', {
      organization_id,
      vendor_code: `RLS-${stamp}`,
      vendor_name: 'Vendor Org A',
      bank_account_number: '1234567890',
      status: 'verified',
    });
    poA = await insertOne('purchase_orders', {
      organization_id,
      po_number: `RLS-PO-${stamp}`,
      vendor_id: vendorA,
      po_date: '2026-01-01',
    });
    await insertOne('purchase_order_lines', {
      organization_id,
      po_id: poA,
      line_no: 1,
      item_description: 'Item',
      quantity: 1,
      unit_price: 1000,
    });
    documentA = await insertOne('documents', {
      organization_id,
      storage_path: `${orgA}/rls.pdf`,
      original_filename: 'rls.pdf',
      mime_type: 'application/pdf',
      uploaded_by: userAId,
    });
    await insertOne('extractions', { organization_id, document_id: documentA });
    const invoice = await insertOne('invoices', { organization_id, document_id: documentA });
    matchA = await insertOne('matches', { organization_id, invoice_id: invoice, status: 'NO_MATCH' });
    await insertOne('investigation_notes', {
      organization_id,
      match_id: matchA,
      author_id: userAId,
      note: 'Catatan',
    });
    await insertOne('review_sessions', { organization_id, match_id: matchA, reviewer_id: userAId });
    const followup = await insertOne('followups', {
      organization_id,
      match_id: matchA,
      subject: 'S',
      body: 'B',
      ai_generated_body: 'B',
      created_by: userAId,
    });
    await insertOne('followup_replies', {
      organization_id,
      followup_id: followup,
      pasted_by: userAId,
      body: 'R',
    });
    await insertOne('llm_calls', {
      organization_id,
      purpose: 'chatbot',
      model: 'test',
      prompt_version: 'test',
      ok: true,
    });

    const { count } = await admin
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgA);
    if (!count) {
      await insertOne('audit_logs', { organization_id: orgA, entity_type: 'test', action: 'fixture' });
    }

    asUserA = await signIn(userA);
    asUserB = await signIn(userB);
  });

  // Guarded per id: beforeAll may have failed halfway, and a cleanup crash
  // would otherwise hide the real failure. followup_replies, notes, sessions,
  // followups, matches, invoices and extractions cascade from documents.
  afterAll(async () => {
    if (!admin) return;
    for (const table of ['llm_calls', 'documents', 'purchase_orders', 'vendors']) {
      if (created[table]) await admin.from(table).delete().in('id', created[table]);
    }
    for (const id of [userAId, userBId].filter(Boolean)) {
      await admin.from('profiles').delete().eq('id', id);
      await admin.auth.admin.deleteUser(id);
    }
    if (orgB) await admin.from('organizations').delete().eq('id', orgB);
  });

  describe('organization isolation', () => {
    it.each(ORG_TABLES)('org B cannot read org A rows of %s', async (table) => {
      const { count } = await admin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgA);
      expect(count).toBeGreaterThan(0);

      const { data, error } = await asUserB.from(table).select('id').eq('organization_id', orgA);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it.each(ORG_TABLES)('org B cannot insert a row of org A into %s', async (table) => {
      const { error } = await asUserB.from(table).insert({ organization_id: orgA });
      expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    });

    it('sees only its own organization', async () => {
      const { data } = await asUserB.from('organizations').select('id');
      expect(data).toEqual([{ id: orgB }]);
    });

    it('cannot create an organization', async () => {
      const { error } = await asUserB.from('organizations').insert({ name: 'Should not exist' });
      expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  describe('authenticated is read-only (D21)', () => {
    it('can still read its own organization', async () => {
      const { data, error } = await asUserA.from('vendors').select('id').eq('id', vendorA);
      expect(error).toBeNull();
      expect(data).toEqual([{ id: vendorA }]);
    });

    it.each(['organizations', ...ORG_TABLES])('cannot insert into, update or delete %s', async (table) => {
      const row: Record<string, unknown> =
        table === 'organizations' ? { name: 'x' } : { organization_id: orgA };

      const insert = await asUserA.from(table).insert(row);
      expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      const update = await asUserA.from(table).update(row).eq('id', NOWHERE);
      expect(update.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      const del = await asUserA.from(table).delete().eq('id', NOWHERE);
      expect(del.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    });

    it('ap_staff cannot promote itself through profiles.role', async () => {
      const { error } = await asUserA.from('profiles').update({ role: 'admin' }).eq('id', userAId);
      expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);

      const { data } = await admin.from('profiles').select('role').eq('id', userAId).single();
      expect(data?.role).toBe('ap_staff');
    });

    it('ap_staff cannot approve through matches.review_status', async () => {
      const { error } = await asUserA
        .from('matches')
        .update({ review_status: 'APPROVED' })
        .eq('id', matchA);
      expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);

      const { data } = await admin.from('matches').select('review_status').eq('id', matchA).single();
      expect(data?.review_status).toBe('PENDING_REVIEW');
    });

    it('ap_staff cannot change vendors.bank_account_number', async () => {
      const { error } = await asUserA
        .from('vendors')
        .update({ bank_account_number: '9999999999' })
        .eq('id', vendorA);
      expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);

      const { data } = await admin
        .from('vendors')
        .select('bank_account_number')
        .eq('id', vendorA)
        .single();
      expect(data?.bank_account_number).toBe('1234567890');
    });

    it('ap_staff cannot insert into audit_logs', async () => {
      const { error } = await asUserA
        .from('audit_logs')
        .insert({ organization_id: orgA, entity_type: 'vendor', action: 'forged' });
      expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  describe('deactivated users', () => {
    it('read nothing even while their JWT is still valid', async () => {
      await admin.from('profiles').update({ deactivated_at: new Date().toISOString() }).eq('id', userAId);
      try {
        const { data, error } = await asUserA.from('vendors').select('id');
        expect(error).toBeNull();
        expect(data).toEqual([]);
      } finally {
        await admin.from('profiles').update({ deactivated_at: null }).eq('id', userAId);
      }
    });
  });

  describe('audit_logs is append-only', () => {
    it('refuses UPDATE and DELETE for authenticated', async () => {
      const update = await asUserA.from('audit_logs').update({ reason: 'tampered' }).eq('id', NOWHERE);
      expect(update.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      const del = await asUserA.from('audit_logs').delete().eq('id', NOWHERE);
      expect(del.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    });

    it('the trigger refuses UPDATE and DELETE for the service role too', async () => {
      // Statement-level: fires even when no row matches, so nothing is left
      // behind. The message proves the trigger, not a grant, stopped it.
      const update = await admin.from('audit_logs').update({ reason: 'tampered' }).eq('id', NOWHERE);
      expect(update.error?.message).toMatch(/append-only/);
      const del = await admin.from('audit_logs').delete().eq('id', NOWHERE);
      expect(del.error?.message).toMatch(/append-only/);
    });
  });
});
