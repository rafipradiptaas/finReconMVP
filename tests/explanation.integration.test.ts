import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureOrgId } from './helpers/fixture-org';
import { allTruths, perfectExtraction } from './helpers/ground-truth';

/**
 * The real explain-match path with no key: nothing leaves the machine, the
 * pipeline completes, the explanation is null and llm_calls records the failure.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const mocks = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  extractInvoice: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getSessionContext: async () => mocks.session }));
vi.mock('@/lib/audit', () => ({ logAudit: async () => {} }));
vi.mock('@/lib/llm/extract-invoice', () => ({ extractInvoice: mocks.extractInvoice }));

const { POST: upload } = await import('@/app/api/documents/upload/route');

const stamp = Date.now();
const truth = allTruths().find((candidate) => candidate.doc_id === 'fx01')!;

describe.skipIf(!url || !serviceKey)('match explanation with the LLM unavailable', () => {
  let admin: SupabaseClient;
  let org: string;
  let userId: string;
  let documentId: string | undefined;
  let matchId: string | undefined;

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    org = await fixtureOrgId(admin);
    const { data, error } = await admin.auth.admin.createUser({
      email: `explain-${stamp}@finrecon.test`,
      password: `explain-${stamp}`,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    await admin.from('profiles').insert({ id: userId, organization_id: org, role: 'ap_staff' });
  });

  afterAll(async () => {
    if (!admin) return;
    if (matchId) await admin.from('llm_calls').delete().eq('entity_id', matchId);
    if (documentId) {
      await admin.storage.from('documents').remove([`${org}/${documentId}.pdf`]);
      await admin.from('documents').delete().eq('id', documentId);
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  beforeEach(() => {
    mocks.session = { userId, organizationId: org, role: 'ap_staff', fullName: null };
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('completes the upload, stores null and logs the failed call', async () => {
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

    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data).toMatchObject({ status: 'EXTRACTED', matchingFailed: false });
    documentId = data.documentId;

    const { data: invoice } = await admin
      .from('invoices')
      .select('matches(id, status, explanation)')
      .eq('document_id', documentId)
      .single();
    const match = invoice!.matches as unknown as { id: string; status: string; explanation: string | null };
    matchId = match.id;
    expect(match.explanation).toBeNull();
    expect(match.status).toBe('REJECTED');

    const { data: calls } = await admin
      .from('llm_calls')
      .select('purpose, ok, error_code, entity_type')
      .eq('entity_id', match.id);
    expect(calls).toEqual([
      { purpose: 'explain_match', ok: false, error_code: 'missing_api_key', entity_type: 'match' },
    ]);
  });
});
