import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureOrgId } from './helpers/fixture-org';
import { allTruths, perfectExtraction } from './helpers/ground-truth';

/**
 * A matching failure must not undo an extraction (real database, fixture
 * organization, D22). The LLM is mocked, and runMatching throws on demand.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const mocks = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  logAudit: vi.fn(async () => {}),
  extractInvoice: vi.fn(),
  matchingError: null as null | Error,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getSessionContext: async () => mocks.session }));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/llm/extract-invoice', () => ({ extractInvoice: mocks.extractInvoice }));
vi.mock('@/lib/llm/explain-match', () => ({ explainMatch: async () => null }));
vi.mock('@/lib/matching', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/matching')>();
  return {
    ...actual,
    runMatching: (...args: Parameters<typeof actual.runMatching>) => {
      if (mocks.matchingError) throw mocks.matchingError;
      return actual.runMatching(...args);
    },
  };
});

const { POST: upload } = await import('@/app/api/documents/upload/route');
const { POST: correct } = await import('@/app/api/documents/[id]/correct/route');
const { POST: rematch } = await import('@/app/api/documents/[id]/rematch/route');

const stamp = Date.now();
const truth = allTruths().find((candidate) => candidate.doc_id === 'fx01')!;
const failure = Object.assign(new Error('connection lost'), { code: '08006' });

const postRematch = (id: string) =>
  rematch(new Request('http://test.local', { method: 'POST' }), { params: Promise.resolve({ id }) });

describe.skipIf(!url || !serviceKey)('matching failure and rematch', () => {
  let admin: SupabaseClient;
  let org: string;
  let otherOrg: string;
  let userId: string;
  const documents: string[] = [];

  async function uploadInvoice() {
    mocks.extractInvoice.mockResolvedValue({
      ok: true,
      raw: perfectExtraction(truth.fields),
      model: 'test-model',
      promptVersion: 'test-1',
      records: [],
    });
    const form = new FormData();
    form.append('file', new File([readFileSync(truth.file)], 'invoice.pdf', { type: 'application/pdf' }));
    const response = await upload(new Request('http://test.local', { method: 'POST', body: form }));
    const body = await response.json();
    documents.push(body.data.documentId);
    return { response, data: body.data as { documentId: string; status: string; matchingFailed: boolean } };
  }

  async function stateOf(id: string) {
    const { data, error } = await admin
      .from('documents')
      .select('status, status_message, invoices(id, matches(id, status, review_status))')
      .eq('id', id)
      .single();
    if (error) throw error;
    const { invoices, ...document } = data as unknown as {
      status: string;
      status_message: string | null;
      invoices: { id: string; matches: { id: string; status: string; review_status: string } | null };
    };
    return { ...document, invoiceId: invoices.id, match: invoices.matches };
  }

  const audited = () =>
    (mocks.logAudit.mock.calls as unknown as [{ action: string; newValue: unknown } | object[]][])
      .flatMap(([entry]) => entry as { action: string; newValue: unknown })
      .map(({ action, newValue }) => ({ action, newValue }));
  const actions = () => audited().map(({ action }) => action);

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    org = await fixtureOrgId(admin);
    otherOrg = (await admin.from('organizations').select('id').neq('id', org).limit(1).single()).data!.id;
    const { data, error } = await admin.auth.admin.createUser({
      email: `rematch-${stamp}@finrecon.test`,
      password: `rematch-${stamp}`,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    await admin.from('profiles').insert({ id: userId, organization_id: org, role: 'ap_staff' });
  });

  afterAll(async () => {
    if (!admin) return;
    if (documents.length > 0) {
      await admin.storage.from('documents').remove(documents.map((id) => `${org}/${id}.pdf`));
      await admin.from('documents').delete().in('id', documents);
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  beforeEach(() => {
    mocks.logAudit.mockClear();
    mocks.matchingError = null;
    mocks.session = { userId, organizationId: org, role: 'ap_staff', fullName: null };
  });

  it('upload succeeds for the extraction when matching throws, and the failure is audited', async () => {
    mocks.matchingError = failure;
    const { response, data } = await uploadInvoice();

    expect(response.status).toBe(201);
    expect(data).toMatchObject({ status: 'EXTRACTED', matchingFailed: true });
    const state = await stateOf(data.documentId);
    expect(state.status).toBe('EXTRACTED');
    expect(state.status_message).toBe('MATCHING_FAILED: 08006');
    expect(state.match).toBeNull();
    expect(audited()).toContainEqual({
      action: 'matching_failed',
      newValue: { status_message: 'MATCHING_FAILED: 08006', error: 'connection lost' },
    });
  });

  it('rematch completes the match, clears the mark and audits, then is idempotent', async () => {
    mocks.matchingError = failure;
    const { data } = await uploadInvoice();
    mocks.matchingError = null;
    mocks.logAudit.mockClear();

    const first = await postRematch(data.documentId);
    expect(first.status).toBe(200);
    expect((await first.json()).data).toEqual({ rematched: true });
    const state = await stateOf(data.documentId);
    expect(state.status_message).toBeNull();
    expect(state.match?.review_status).toBe('PENDING_REVIEW');
    expect(actions()).toEqual(['match_completed', 'rematch_requested']);

    mocks.logAudit.mockClear();
    const second = await postRematch(data.documentId);
    expect(second.status).toBe(200);
    expect((await second.json()).data).toEqual({ rematched: false });
    expect(actions()).toEqual([]);
    expect((await stateOf(data.documentId)).match?.id).toBe(state.match?.id);
  });

  it('keeps the mark and reports when rematch fails again', async () => {
    mocks.matchingError = failure;
    const { data } = await uploadInvoice();
    mocks.logAudit.mockClear();

    const response = await postRematch(data.documentId);
    expect(response.status).toBe(500);
    expect((await stateOf(data.documentId)).status_message).toBe('MATCHING_FAILED: 08006');
    expect(actions()).toEqual(['matching_failed', 'rematch_requested']);
  });

  it('a correction succeeds when its re-match throws, and the stale match can be rerun', async () => {
    const { data } = await uploadInvoice();
    const before = await stateOf(data.documentId);
    expect(before.match).not.toBeNull();

    mocks.matchingError = failure;
    const response = await correct(
      new Request('http://test.local', {
        method: 'POST',
        body: JSON.stringify({ corrections: { po_number: 'PO-TIDAK-ADA' } }),
      }),
      { params: Promise.resolve({ id: data.documentId }) },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ status: 'EXTRACTED', matchingFailed: true });
    expect((await stateOf(data.documentId)).status_message).toBe('MATCHING_FAILED: 08006');

    mocks.matchingError = null;
    expect((await (await postRematch(data.documentId)).json()).data).toEqual({ rematched: true });
    expect((await stateOf(data.documentId)).status_message).toBeNull();
  });

  it('never touches a decided match', async () => {
    const { data } = await uploadInvoice();
    const { match } = await stateOf(data.documentId);
    await admin.from('matches').update({ review_status: 'APPROVED' }).eq('id', match!.id);
    await admin
      .from('documents')
      .update({ status_message: 'MATCHING_FAILED: 08006' })
      .eq('id', data.documentId);

    expect((await (await postRematch(data.documentId)).json()).data).toEqual({ rematched: false });
    expect((await stateOf(data.documentId)).match?.review_status).toBe('APPROVED');
  });

  it('refuses a document with no extraction to match', async () => {
    const { data } = await uploadInvoice();
    await admin.from('documents').update({ status: 'NEEDS_CORRECTION' }).eq('id', data.documentId);
    expect((await postRematch(data.documentId)).status).toBe(409);
  });

  it('allows every role, and hides other organizations', async () => {
    const { data } = await uploadInvoice();
    for (const role of ['admin', 'ap_staff', 'approver']) {
      mocks.session = { userId, organizationId: org, role, fullName: null };
      expect((await postRematch(data.documentId)).status).toBe(200);
    }
    mocks.session = { userId, organizationId: otherOrg, role: 'admin', fullName: null };
    expect((await postRematch(data.documentId)).status).toBe(404);
    mocks.session = null;
    expect((await postRematch(data.documentId)).status).toBe(401);
    mocks.session = { userId, organizationId: org, role: 'admin', fullName: null };
    expect((await postRematch('not-a-uuid')).status).toBe(400);
  });
});
