import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureOrgId, fixtureReviewerId } from './helpers/fixture-org';
import { fields, fullBreakdown } from './review/helpers';

/**
 * The review routes against the real database, in the fixture organization
 * (D22). Matches are inserted directly, so each case states exactly what it
 * starts from. logAudit is mocked: audit rows can never be deleted, and
 * asserting the payload proves what would be written.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const mocks = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  logAudit: vi.fn(async () => {}),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getSessionContext: async () => mocks.session }));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));

const { POST: openSession } = await import('@/app/api/matches/[id]/session/route');
const { POST: review } = await import('@/app/api/matches/[id]/review/route');
const { POST: note } = await import('@/app/api/matches/[id]/note/route');
const { POST: markPaid } = await import('@/app/api/matches/[id]/mark-paid/route');

const stamp = Date.now();
const LOW = 50_000_000;
const HIGH = 100_000_000;
const CRITICAL = [
  'evidence:invoice_number',
  'evidence:subtotal',
  'evidence:total_amount',
  'evidence:bank_account_number',
  'evidence:npwp',
];
const LONG_REASON = 'Nominal sudah dikonfirmasi ke vendor';

type Seed = {
  status?: string;
  anomaly_flag?: boolean;
  review_status?: string;
  total_amount?: number;
  veto_code?: string;
  score_breakdown?: unknown;
  invoice_number?: string;
  uploaded_by?: string;
  status_message?: string;
};

const call = (
  route: typeof review,
  id: string,
  body?: unknown,
) =>
  route(new Request('http://test.local', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

describe.skipIf(!url || !serviceKey)('review routes', () => {
  let admin: SupabaseClient;
  let org: string;
  let otherOrg: string;
  let vendorId: string;
  const users: Record<string, string> = {};
  const documents: string[] = [];

  const as = (role: 'uploader' | 'ap_staff' | 'approver' | 'admin') => {
    mocks.session = {
      userId: users[role],
      organizationId: org,
      role: role === 'uploader' ? 'ap_staff' : role,
      fullName: null,
    };
  };

  async function must<T>(query: PromiseLike<{ data: T; error: unknown }>) {
    const { data, error } = await query;
    if (error) throw error;
    return data as NonNullable<T>;
  }

  async function seed(over: Seed = {}) {
    const documentId = randomUUID();
    documents.push(documentId);
    await must(
      admin.from('documents').insert({
        id: documentId,
        organization_id: org,
        storage_path: `${org}/${documentId}.pdf`,
        original_filename: 'review.pdf',
        mime_type: 'application/pdf',
        status: 'EXTRACTED',
        status_message: over.status_message ?? null,
        uploaded_by: over.uploaded_by ?? users.uploader,
      }),
    );
    await must(
      admin.from('extractions').insert({
        organization_id: org,
        document_id: documentId,
        raw_json: {},
        fields: fields(),
        model: 'test',
      }),
    );
    const number = over.invoice_number ?? `REVIEW-${stamp}-${documents.length}`;
    const invoice = await must(
      admin
        .from('invoices')
        .insert({
          organization_id: org,
          document_id: documentId,
          vendor_id: vendorId,
          invoice_number: number,
          invoice_number_normalized: number.replace(/-/g, ''),
          total_amount: over.total_amount ?? LOW,
        })
        .select('id')
        .single(),
    );
    const match = await must(
      admin
        .from('matches')
        .insert({
          organization_id: org,
          invoice_id: invoice.id,
          status: over.status ?? 'FULL_MATCH',
          veto_code: over.veto_code ?? null,
          anomaly_flag: over.anomaly_flag ?? false,
          review_status: over.review_status ?? 'PENDING_REVIEW',
          score_breakdown: over.score_breakdown ?? fullBreakdown(),
        })
        .select('id')
        .single(),
    );
    return match.id as string;
  }

  const matchRow = (id: string) => must(admin.from('matches').select('*').eq('id', id).single());
  const sessions = (id: string) =>
    must(admin.from('review_sessions').select('*').eq('match_id', id).order('opened_at'));
  const statusOf = async (response: Response) => ({
    status: response.status,
    code: (await response.clone().json()).error?.code,
  });
  const lastAudit = () => (mocks.logAudit.mock.calls as unknown as [Record<string, unknown>][]).at(-1)?.[0];

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    org = await fixtureOrgId(admin);
    otherOrg = (await admin.from('organizations').select('id').neq('id', org).limit(1).single()).data!.id;
    for (const [name, role] of [
      ['uploader', 'ap_staff'],
      ['ap_staff', 'ap_staff'],
      ['approver', 'approver'],
      ['admin', 'admin'],
    ]) {
      const { data, error } = await admin.auth.admin.createUser({
        email: `review-${name}-${stamp}@finrecon.test`,
        password: `review-${stamp}`,
        email_confirm: true,
      });
      if (error) throw error;
      users[name] = data.user.id;
      await must(admin.from('profiles').insert({ id: data.user.id, organization_id: org, role }));
    }
    const vendor = await must(
      admin
        .from('vendors')
        .insert({ organization_id: org, vendor_code: `REVIEW-${stamp}`, vendor_name: `PT Review ${stamp}`, status: 'verified' })
        .select('id')
        .single(),
    );
    vendorId = vendor.id;
  });

  afterAll(async () => {
    if (!admin) return;
    if (documents.length > 0) await admin.from('documents').delete().in('id', documents);
    if (vendorId) await admin.from('vendors').delete().eq('id', vendorId);
    for (const id of Object.values(users)) {
      await admin.from('profiles').delete().eq('id', id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  beforeEach(() => {
    mocks.logAudit.mockClear();
    as('approver');
  });

  describe('POST session', () => {
    it('opens at server time and is idempotent per reviewer while open', async () => {
      const id = await seed();
      const before = Date.now();
      const first = await (await call(openSession, id)).json();
      const second = await (await call(openSession, id)).json();
      expect(second.data.id).toBe(first.data.id);
      expect(new Date(first.data.opened_at).getTime()).toBeGreaterThan(before - 60_000);
      expect(await sessions(id)).toHaveLength(1);

      as('ap_staff');
      await call(openSession, id);
      expect(await sessions(id)).toHaveLength(2);
    });

    it('refuses the uploader, a veto, and a decided match', async () => {
      as('uploader');
      expect((await call(openSession, await seed())).status).toBe(403);
      as('approver');
      expect((await call(openSession, await seed({ status: 'REJECTED', veto_code: 'VETO_BANK_MISMATCH' }))).status).toBe(409);
      expect((await call(openSession, await seed({ review_status: 'APPROVED' }))).status).toBe(409);
    });
  });

  describe('POST review', () => {
    it('approves a one-click FULL_MATCH and writes match, session and audit', async () => {
      const id = await seed();
      await call(openSession, id);
      const response = await call(review, id, { decision: 'APPROVED' });
      expect(response.status).toBe(200);

      expect(await matchRow(id)).toMatchObject({
        review_status: 'APPROVED',
        reviewed_by: users.approver,
        review_reason: null,
      });
      const [session] = await sessions(id);
      expect(session).toMatchObject({ decision: 'APPROVED', items_ticked: [], fields_corrected_count: 0 });
      expect(session.decided_at).not.toBeNull();
      expect(lastAudit()).toMatchObject({
        entityType: 'match',
        entityId: id,
        action: 'review_decided',
        oldValue: { review_status: 'PENDING_REVIEW', match_status: 'FULL_MATCH' },
        newValue: { review_status: 'APPROVED', items_ticked: [], override: false },
      });
    });

    it('opens a session when none is open, so a decision always leaves one', async () => {
      const id = await seed();
      await call(review, id, { decision: 'APPROVED' });
      expect(await sessions(id)).toHaveLength(1);
    });

    it('counts the corrections the reviewer made during the session', async () => {
      const id = await seed();
      const { invoice_id } = await matchRow(id);
      const { document_id } = await must(admin.from('invoices').select('document_id').eq('id', invoice_id).single());
      const reviewer = await fixtureReviewerId(admin, org);
      mocks.session = { userId: reviewer, organizationId: org, role: 'approver', fullName: null };
      await call(openSession, id);
      const audit = {
        organization_id: org,
        actor_user_id: reviewer,
        actor_role: 'approver',
        entity_type: 'document',
        entity_id: document_id,
        action: 'field_corrected',
      };
      await must(admin.from('audit_logs').insert([audit, audit]));
      await call(review, id, { decision: 'APPROVED' });
      const [session] = await sessions(id);
      expect(session.fields_corrected_count).toBe(2);
    });

    it('records an override, with the original status and the ticked items', async () => {
      const breakdown = { ...fullBreakdown(), amount: { value: 11.11, max: 25 } };
      const id = await seed({ status: 'PARTIAL_MATCH', score_breakdown: breakdown });

      expect(await statusOf(await call(review, id, { decision: 'APPROVED', reason: 'ok' }))).toEqual({
        status: 400,
        code: 'ITEMS_REQUIRED',
      });
      expect(await statusOf(await call(review, id, { decision: 'APPROVED', itemsTicked: ['score:amount'] }))).toEqual({
        status: 400,
        code: 'REASON_REQUIRED',
      });
      expect((await matchRow(id)).review_status).toBe('PENDING_REVIEW');

      const ok = await call(review, id, { decision: 'APPROVED', itemsTicked: ['score:amount', 'forged'], reason: ' Harga naik sesuai addendum ' });
      expect(ok.status).toBe(200);
      expect((await matchRow(id)).review_reason).toBe('Harga naik sesuai addendum');
      expect(lastAudit()).toMatchObject({
        oldValue: { match_status: 'PARTIAL_MATCH' },
        newValue: { items_ticked: ['score:amount'], override: true },
        reason: 'Harga naik sesuai addendum',
      });
      expect((await sessions(id))[0]).toMatchObject({ items_ticked: ['score:amount'], reason: 'Harga naik sesuai addendum' });
    });

    it('needs evidence ticks for FULL_MATCH at Rp 100 jt', async () => {
      const id = await seed({ total_amount: HIGH });
      expect((await call(review, id, { decision: 'APPROVED' })).status).toBe(400);
      expect((await call(review, id, { decision: 'APPROVED', itemsTicked: CRITICAL })).status).toBe(200);
    });

    it('needs the anomaly tick and a 20-character reason', async () => {
      const id = await seed({ anomaly_flag: true });
      const ticked = { decision: 'APPROVED', itemsTicked: ['anomaly'] };
      expect(await statusOf(await call(review, id, { ...ticked, reason: 'terlalu pendek' }))).toEqual({
        status: 400,
        code: 'REASON_TOO_SHORT',
      });
      expect((await call(review, id, { ...ticked, reason: LONG_REASON })).status).toBe(200);
    });

    it('a reject needs a reason, and no ticks', async () => {
      const id = await seed({ total_amount: HIGH });
      expect((await call(review, id, { decision: 'REJECTED_BY_REVIEWER' })).status).toBe(400);
      expect((await call(review, id, { decision: 'REJECTED_BY_REVIEWER', reason: 'Tidak dipesan' })).status).toBe(200);
      expect(await matchRow(id)).toMatchObject({ review_status: 'REJECTED_BY_REVIEWER', review_reason: 'Tidak dipesan' });
    });

    it.each(['APPROVED', 'REJECTED_BY_REVIEWER'])('refuses the uploader with 403: %s', async (decision) => {
      const id = await seed();
      as('uploader');
      const response = await call(review, id, { decision, reason: LONG_REASON });
      expect(await statusOf(response)).toEqual({ status: 403, code: 'UPLOADER_CANNOT_REVIEW' });
      expect((await matchRow(id)).review_status).toBe('PENDING_REVIEW');
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it.each(['ap_staff', 'approver', 'admin'] as const)('%s may review', async (role) => {
      const id = await seed();
      as(role);
      expect((await call(review, id, { decision: 'APPROVED' })).status).toBe(200);
    });

    it.each(['APPROVED', 'REJECTED_BY_REVIEWER'])('a veto has no review path: %s', async (decision) => {
      const id = await seed({ status: 'REJECTED', veto_code: 'VETO_BANK_MISMATCH', score_breakdown: null });
      const response = await call(review, id, { decision, reason: LONG_REASON });
      expect(await statusOf(response)).toEqual({ status: 409, code: 'VETO_NOT_REVIEWABLE' });
      expect((await matchRow(id)).review_status).toBe('PENDING_REVIEW');
    });

    it.each(['APPROVED', 'REJECTED_BY_REVIEWER', 'PAID'])('refuses a second decision on %s', async (reviewStatus) => {
      const id = await seed({ review_status: reviewStatus });
      for (const decision of ['APPROVED', 'REJECTED_BY_REVIEWER']) {
        expect(await statusOf(await call(review, id, { decision, reason: LONG_REASON }))).toEqual({
          status: 409,
          code: 'INVALID_TRANSITION',
        });
      }
    });

    it('refuses to decide on a match whose re-match failed', async () => {
      const id = await seed({ status_message: 'MATCHING_FAILED: 08006' });
      expect(await statusOf(await call(review, id, { decision: 'APPROVED' }))).toEqual({
        status: 409,
        code: 'MATCHING_FAILED',
      });
    });

    it('refuses to approve the twin of an approved invoice, but allows rejecting it', async () => {
      const number = `TWIN-${stamp}`;
      await seed({ invoice_number: number, review_status: 'APPROVED' });
      const id = await seed({ invoice_number: number });
      expect(await statusOf(await call(review, id, { decision: 'APPROVED' }))).toEqual({
        status: 409,
        code: 'DUPLICATE_DECIDED',
      });
      expect((await call(review, id, { decision: 'REJECTED_BY_REVIEWER', reason: 'Duplikat' })).status).toBe(200);
    });

    it('validates input and hides other organizations', async () => {
      const id = await seed();
      expect((await call(review, id, { decision: 'PAID' })).status).toBe(400);
      expect((await call(review, 'not-a-uuid', { decision: 'APPROVED' })).status).toBe(400);
      expect((await call(review, randomUUID(), { decision: 'APPROVED' })).status).toBe(404);
      mocks.session = { userId: users.approver, organizationId: otherOrg, role: 'approver', fullName: null };
      expect((await call(review, id, { decision: 'APPROVED' })).status).toBe(404);
      mocks.session = null;
      expect((await call(review, id, { decision: 'APPROVED' })).status).toBe(401);
    });
  });

  describe('POST note', () => {
    it('any role may write one, the uploader included, and no status changes', async () => {
      const id = await seed({ status: 'REJECTED', veto_code: 'VETO_BANK_MISMATCH', score_breakdown: null });
      for (const role of ['uploader', 'ap_staff', 'approver', 'admin'] as const) {
        as(role);
        expect((await call(note, id, { note: `Catatan ${role}` })).status).toBe(201);
      }
      expect(await must(admin.from('investigation_notes').select('id').eq('match_id', id))).toHaveLength(4);
      expect(await matchRow(id)).toMatchObject({ status: 'REJECTED', review_status: 'PENDING_REVIEW' });
      expect(lastAudit()).toMatchObject({ action: 'investigation_note_added', entityId: id, reason: 'Catatan admin' });
    });

    it('needs text, and hides other organizations', async () => {
      const id = await seed();
      expect((await call(note, id, { note: '   ' })).status).toBe(400);
      mocks.session = { userId: users.approver, organizationId: otherOrg, role: 'approver', fullName: null };
      expect((await call(note, id, { note: 'x' })).status).toBe(404);
    });
  });

  describe('POST mark-paid', () => {
    it('moves APPROVED to PAID, for the approver, with an audit row', async () => {
      const id = await seed({ review_status: 'APPROVED' });
      expect((await call(markPaid, id)).status).toBe(200);
      const row = await matchRow(id);
      expect(row).toMatchObject({ review_status: 'PAID', paid_marked_by: users.approver });
      expect(row.paid_at).not.toBeNull();
      expect(lastAudit()).toMatchObject({
        action: 'match_marked_paid',
        oldValue: { review_status: 'APPROVED' },
        newValue: { review_status: 'PAID' },
      });
    });

    it.each(['ap_staff', 'admin'] as const)('refuses %s with 403', async (role) => {
      const id = await seed({ review_status: 'APPROVED' });
      as(role);
      expect((await call(markPaid, id)).status).toBe(403);
      expect((await matchRow(id)).review_status).toBe('APPROVED');
    });

    it.each(['PENDING_REVIEW', 'REJECTED_BY_REVIEWER', 'PAID'])('refuses %s with 409', async (reviewStatus) => {
      const id = await seed({ review_status: reviewStatus });
      expect((await call(markPaid, id)).status).toBe(409);
      expect((await matchRow(id)).review_status).toBe(reviewStatus);
    });

    it('hides other organizations', async () => {
      const id = await seed({ review_status: 'APPROVED' });
      mocks.session = { userId: users.approver, organizationId: otherOrg, role: 'approver', fullName: null };
      expect((await call(markPaid, id)).status).toBe(404);
    });
  });
});
