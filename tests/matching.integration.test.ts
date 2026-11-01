import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureOrgId } from './helpers/fixture-org';
import { allTruths, perfectExtraction } from './helpers/ground-truth';

/**
 * Upload and correction through to the matches table, in the fixture
 * organization (D22). The LLM is mocked. Invoice numbers are stamped so a
 * parallel test file cannot look like a duplicate.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const mocks = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  logAudit: vi.fn(async () => {}),
  extractInvoice: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getSessionContext: async () => mocks.session }));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/llm/extract-invoice', () => ({ extractInvoice: mocks.extractInvoice }));

const { POST: upload } = await import('@/app/api/documents/upload/route');
const { POST: correct } = await import('@/app/api/documents/[id]/correct/route');

const stamp = Date.now();
const fx = (id: string) => allTruths().find((truth) => truth.doc_id === id)!;
const npwp = String(stamp).padStart(15, '7');
const poNumber = `PO-MATCH-${stamp}`;
const vendorName = `PT Integrasi Matching ${stamp}`;

describe.skipIf(!url || !serviceKey)('matching after upload and correction', () => {
  let admin: SupabaseClient;
  let org: string;
  let userId: string;
  let vendorId: string;
  let poId: string;
  const documents: string[] = [];

  /** Fixture 01's PDF, with a raw read that points at this test's own vendor and PO. */
  async function uploadInvoice(number: string | null, over: Record<string, unknown> = {}) {
    const raw = perfectExtraction({
      ...fx('fx01').fields,
      invoice_number: number,
      vendor_name: vendorName,
      npwp,
      po_number: poNumber,
      ...over,
    });
    // The checks read the real PDF, so these values are not grounded in it.
    mocks.extractInvoice.mockResolvedValue({
      ok: true,
      raw,
      model: 'test-model',
      promptVersion: 'test-1',
      records: [],
    });
    const form = new FormData();
    form.append('file', new File([readFileSync(fx('fx01').file)], 'invoice.pdf', { type: 'application/pdf' }));
    const response = await upload(new Request('http://test.local', { method: 'POST', body: form }));
    const { data } = await response.json();
    documents.push(data.documentId);
    return data as { documentId: string; status: string };
  }

  const postCorrection = (id: string, corrections: unknown) =>
    correct(new Request('http://test.local', { method: 'POST', body: JSON.stringify({ corrections }) }), {
      params: Promise.resolve({ id }),
    });

  async function matchOf(documentId: string) {
    const { data: invoice } = await admin
      .from('invoices')
      .select('id, vendor_id, po_id')
      .eq('document_id', documentId)
      .single();
    const { data: match } = await admin.from('matches').select('*').eq('invoice_id', invoice!.id).maybeSingle();
    return { invoice: invoice!, match };
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    org = await fixtureOrgId(admin);
    const { data, error } = await admin.auth.admin.createUser({
      email: `matching-${stamp}@finrecon.test`,
      password: `matching-${stamp}`,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    await admin.from('profiles').insert({ id: userId, organization_id: org, role: 'ap_staff' });

    const master = fx('fx01').fields;
    const { data: vendor, error: vendorError } = await admin
      .from('vendors')
      .insert({
        organization_id: org,
        vendor_code: `MATCH-${stamp}`,
        vendor_name: vendorName,
        npwp,
        bank_name: master.bank_name,
        bank_account_number: master.bank_account_number,
        bank_account_holder: master.bank_account_holder,
        status: 'verified',
      })
      .select('id')
      .single();
    if (vendorError) throw vendorError;
    vendorId = vendor.id;

    const { data: po, error: poError } = await admin
      .from('purchase_orders')
      .insert({ organization_id: org, po_number: poNumber, vendor_id: vendorId, po_date: '2026-07-01' })
      .select('id')
      .single();
    if (poError) throw poError;
    poId = po.id;
    const { error: lineError } = await admin.from('purchase_order_lines').insert(
      master.line_items.map((line, index) => ({
        organization_id: org,
        po_id: poId,
        line_no: index + 1,
        item_description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
      })),
    );
    if (lineError) throw lineError;
  });

  afterAll(async () => {
    if (!admin) return;
    if (documents.length > 0) {
      await admin.storage.from('documents').remove(documents.map((id) => `${org}/${id}.pdf`));
      await admin.from('documents').delete().in('id', documents);
    }
    if (poId) await admin.from('purchase_orders').delete().eq('id', poId);
    if (vendorId) await admin.from('vendors').delete().eq('id', vendorId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  beforeEach(() => {
    mocks.logAudit.mockClear();
    mocks.session = { userId, organizationId: org, role: 'ap_staff', fullName: null };
  });

  it('holds an ungrounded read at NEEDS_CORRECTION, with no match', async () => {
    // This test's vendor and PO are not printed on fixture 01, so nothing verifies.
    const { documentId, status } = await uploadInvoice(`M-${stamp}-1`);
    expect(status).toBe('NEEDS_CORRECTION');
    expect((await matchOf(documentId)).match).toBeNull();
  });

  it('a correction reaching EXTRACTED creates the match and links the invoice', async () => {
    const number = `M-${stamp}-2`;
    const { documentId } = await uploadInvoice(number);
    const response = await postCorrection(documentId, { npwp, invoice_number: number });
    expect(response.status).toBe(200);
    expect((await response.json()).data.status).toBe('EXTRACTED');

    const { invoice, match } = await matchOf(documentId);
    expect(invoice).toMatchObject({ vendor_id: vendorId, po_id: poId });
    expect(match).toMatchObject({
      organization_id: org,
      status: 'FULL_MATCH',
      veto_code: null,
      score: 100,
      anomaly_flag: false,
      review_status: 'PENDING_REVIEW',
    });
    expect(match!.score_breakdown.po_number).toEqual({ value: 25, max: 25 });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'match_completed',
        entityId: match!.id,
        newValue: expect.objectContaining({ status: 'FULL_MATCH', score: 100 }),
      }),
      expect.anything(),
    );
  });

  it('a later correction re-runs matching on the same row', async () => {
    const number = `M-${stamp}-3`;
    const { documentId } = await uploadInvoice(number);
    await postCorrection(documentId, { npwp, invoice_number: number });
    const { match: first } = await matchOf(documentId);

    await postCorrection(documentId, { bank_account_number: '9999999999' });

    const { invoice, match } = await matchOf(documentId);
    expect(match).toMatchObject({
      id: first!.id,
      status: 'REJECTED',
      veto_code: 'VETO_BANK_MISMATCH',
      score: null,
      score_breakdown: null,
    });
    expect(invoice.vendor_id).toBe(vendorId);
  });

  it('the same invoice again warns while the first is pending, and vetoes once approved', async () => {
    const number = `M-${stamp}-4`;
    const first = await uploadInvoice(number);
    await postCorrection(first.documentId, { npwp, invoice_number: number });

    const second = await uploadInvoice(number);
    await postCorrection(second.documentId, { npwp, invoice_number: number });
    expect((await matchOf(second.documentId)).match).toMatchObject({ status: 'FULL_MATCH', veto_code: null });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'match_completed',
        newValue: expect.objectContaining({ pending_duplicate_warning: true }),
      }),
      expect.anything(),
    );

    const { match: original } = await matchOf(first.documentId);
    await admin.from('matches').update({ review_status: 'APPROVED' }).eq('id', original!.id);

    const third = await uploadInvoice(number);
    await postCorrection(third.documentId, { npwp, invoice_number: number });
    expect((await matchOf(third.documentId)).match).toMatchObject({
      status: 'REJECTED',
      veto_code: 'VETO_DUPLICATE_INVOICE',
    });
  });
});
