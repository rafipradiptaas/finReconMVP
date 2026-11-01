import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawInvoice } from '@/lib/extraction-checks';
import { fixtureOrgId } from './helpers/fixture-org';
import { allTruths, perfectExtraction } from './helpers/ground-truth';

/**
 * The upload and correction routes against the real database and storage, in
 * the fixture organization (D22). The LLM is mocked: no paid calls, and the
 * result of each document is known.
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
vi.mock('@/lib/llm/explain-match', () => ({ explainMatch: async () => null }));

const { POST: upload } = await import('@/app/api/documents/upload/route');
const { POST: correct } = await import('@/app/api/documents/[id]/correct/route');

const stamp = Date.now();
const truth = (id: string) => allTruths().find((candidate) => candidate.doc_id === id)!;
const extracted = (raw: RawInvoice) => ({
  ok: true,
  raw,
  model: 'test-model',
  promptVersion: 'test-1',
  records: [],
});

function pdfRequest(path: string, name = 'invoice.pdf') {
  const form = new FormData();
  form.append('file', new File([readFileSync(path)], name, { type: 'application/pdf' }));
  return new Request('http://test.local', { method: 'POST', body: form });
}

describe.skipIf(!url || !serviceKey)('document routes', () => {
  let admin: SupabaseClient;
  let org: string;
  let userId: string;
  const documents: string[] = [];

  async function uploadDocument(id: string) {
    const response = await upload(pdfRequest(truth(id).file, `${id}.pdf`));
    const body = await response.json();
    if (body.data?.documentId) documents.push(body.data.documentId);
    return { response, body };
  }

  const postCorrection = (id: string, corrections: unknown) =>
    correct(
      new Request('http://test.local', { method: 'POST', body: JSON.stringify({ corrections }) }),
      { params: Promise.resolve({ id }) },
    );

  async function row(table: string, column: string, id: string, select = '*') {
    const { data, error } = await admin.from(table).select(select).eq(column, id).single();
    if (error) throw error;
    return data as unknown as Record<string, unknown>;
  }

  const auditActions = () =>
    (mocks.logAudit.mock.calls as unknown as [{ action: string } | { action: string }[]][]).flatMap(
      ([entry]) => (Array.isArray(entry) ? entry : [entry]).map(({ action }) => action),
    );

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    org = await fixtureOrgId(admin);
    const { data, error } = await admin.auth.admin.createUser({
      email: `documents-${stamp}@finrecon.test`,
      password: `documents-${stamp}`,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    const { error: profileError } = await admin
      .from('profiles')
      .insert({ id: userId, organization_id: org, role: 'ap_staff', full_name: 'Documents' });
    if (profileError) throw profileError;
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
    mocks.extractInvoice.mockReset();
    mocks.session = { userId, organizationId: org, role: 'ap_staff', fullName: null };
  });

  it('takes a clean invoice to EXTRACTED and stores everything', async () => {
    const raw = perfectExtraction(truth('fx01').fields);
    raw.subtotal.source_text = 'Rp 24.000.000';
    mocks.extractInvoice.mockResolvedValue(extracted(raw));

    const { response, body } = await uploadDocument('fx01');

    expect(response.status).toBe(201);
    expect(body.data.status).toBe('EXTRACTED');
    const { documentId } = body.data;

    const document = await row('documents', 'id', documentId);
    expect(document).toMatchObject({
      organization_id: org,
      status: 'EXTRACTED',
      uploaded_by: userId,
      storage_path: `${org}/${documentId}.pdf`,
    });

    const { data: stored, error } = await admin.storage.from('documents').download(`${org}/${documentId}.pdf`);
    expect(error).toBeNull();
    expect(stored!.size).toBe(readFileSync(truth('fx01').file).length);

    const extraction = await row('extractions', 'document_id', documentId);
    expect(extraction).toMatchObject({ model: 'test-model', prompt_version: 'test-1', checks_version: 'checks-2' });
    const fields = extraction.fields as { subtotal: { verification: string; evidence: unknown[] } };
    expect(fields.subtotal.verification).toBe('verified');
    expect(fields.subtotal.evidence.length).toBeGreaterThan(0);
    expect((extraction.text_items as unknown[]).length).toBeGreaterThan(0);

    expect(await row('invoices', 'document_id', documentId)).toMatchObject({
      organization_id: org,
      invoice_number: 'INV-SLN-2026-0715',
      invoice_number_normalized: 'INVSLN20260715',
      invoice_date: '2026-07-15',
      npwp: '011234567891000',
      subtotal: 24000000,
      tax_amount: 2640000,
      total_amount: 26640000,
      imported_history: false,
    });

    expect(auditActions()).toEqual(
      expect.arrayContaining(['document_uploaded', 'document_status_changed', 'extraction_completed']),
    );
    expect(auditActions().filter((action) => action === 'document_status_changed')).toHaveLength(2);
  });

  it('holds a missing invoice number, and a correction releases it', async () => {
    mocks.extractInvoice.mockResolvedValue(extracted(perfectExtraction(truth('fx04').fields)));
    const { body } = await uploadDocument('fx04');
    expect(body.data.status).toBe('NEEDS_CORRECTION');
    const { documentId } = body.data;
    expect(await row('invoices', 'document_id', documentId, 'invoice_number')).toEqual({ invoice_number: null });

    mocks.logAudit.mockClear();
    const response = await postCorrection(documentId, { invoice_number: 'INV-BKP-777' });
    expect(response.status).toBe(200);
    expect((await response.json()).data.status).toBe('EXTRACTED');

    expect(await row('documents', 'id', documentId, 'status')).toEqual({ status: 'EXTRACTED' });
    expect(
      await row('invoices', 'document_id', documentId, 'invoice_number, invoice_number_normalized'),
    ).toEqual({ invoice_number: 'INV-BKP-777', invoice_number_normalized: 'INVBKP777' });
    const { fields } = await row('extractions', 'document_id', documentId, 'fields');
    expect((fields as Record<string, unknown>).invoice_number).toMatchObject({
      value: 'INV-BKP-777',
      confidence: 'manual',
      verification: 'manual',
    });

    expect(mocks.logAudit).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          action: 'field_corrected',
          oldValue: { field: 'invoice_number', value: null },
          newValue: { field: 'invoice_number', value: 'INV-BKP-777' },
        }),
      ],
      expect.anything(),
    );
    expect(auditActions()).toContain('document_status_changed');
  });

  it('marks a scan UNSUPPORTED_FORMAT without calling the LLM', async () => {
    const { body } = await uploadDocument('fx10');
    expect(body.data.status).toBe('UNSUPPORTED_FORMAT');
    expect(mocks.extractInvoice).not.toHaveBeenCalled();
    const document = await row('documents', 'id', body.data.documentId);
    expect(document.status_message).toMatch(/scan/);
  });

  it('an LLM failure ends in EXTRACTION_FAILED with a clear message, never a 500', async () => {
    mocks.extractInvoice.mockResolvedValue({
      ok: false,
      errorCode: 'auth_rejected',
      model: 'test-model',
      promptVersion: 'test-1',
      records: [],
    });
    const { response, body } = await uploadDocument('fx01');
    expect(response.status).toBe(201);
    expect(body.data.status).toBe('EXTRACTION_FAILED');
    const document = await row('documents', 'id', body.data.documentId);
    expect(document.status_message).toMatch(/ditolak/);
  });

  it('a crash mid-pipeline never leaves a document stuck in EXTRACTING', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.extractInvoice.mockRejectedValue(new Error('surprise'));
    const { body } = await uploadDocument('fx01');
    errors.mockRestore();
    expect(body.data.status).toBe('EXTRACTION_FAILED');
    expect(await row('documents', 'id', body.data.documentId, 'status')).toEqual({ status: 'EXTRACTION_FAILED' });
  });

  it('refuses anything that is not a PDF, whatever its name, and stores nothing', async () => {
    const form = new FormData();
    form.append('file', new File(['not a pdf'], 'invoice.pdf', { type: 'application/pdf' }));
    const response = await upload(new Request('http://test.local', { method: 'POST', body: form }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('refuses an upload with no file', async () => {
    const response = await upload(new Request('http://test.local', { method: 'POST', body: new FormData() }));
    expect(response.status).toBe(400);
  });

  it('requires a session', async () => {
    mocks.session = null;
    const response = await upload(pdfRequest(truth('fx01').file));
    expect(response.status).toBe(401);
  });

  describe('correction rules', () => {
    let documentId: string;

    beforeAll(async () => {
      mocks.session = { userId, organizationId: org, role: 'ap_staff', fullName: null };
      mocks.extractInvoice.mockResolvedValue(extracted(perfectExtraction(truth('fx01').fields)));
      ({
        body: {
          data: { documentId },
        },
      } = await uploadDocument('fx01'));
    });

    it('refuses an invalid value', async () => {
      expect((await postCorrection(documentId, { npwp: '123' })).status).toBe(400);
    });

    it('refuses a field that is not correctable', async () => {
      expect((await postCorrection(documentId, { status: 'EXTRACTED' })).status).toBe(400);
    });

    it('never moves a document back to NEEDS_CORRECTION', async () => {
      const response = await postCorrection(documentId, { total_amount: 1 });
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('CORRECTION_INCONSISTENT');
      expect(await row('invoices', 'document_id', documentId, 'total_amount')).toEqual({ total_amount: 26640000 });
    });

    it('is 404 for a document of another organization', async () => {
      mocks.session = { ...mocks.session, organizationId: '00000000-0000-0000-0000-000000000000' };
      expect((await postCorrection(documentId, { vendor_name: 'X' })).status).toBe(404);
    });

    it('is 409 once the document has no extraction', async () => {
      const { body } = await uploadDocument('fx10');
      expect((await postCorrection(body.data.documentId, { vendor_name: 'X' })).status).toBe(409);
    });

    it('is 409 once the invoice has been decided', async () => {
      const { id: invoiceId } = await row('invoices', 'document_id', documentId, 'id');
      const { error } = await admin.from('matches').upsert(
        { organization_id: org, invoice_id: invoiceId, status: 'FULL_MATCH', review_status: 'APPROVED' },
        { onConflict: 'invoice_id' },
      );
      if (error) throw error;
      expect((await postCorrection(documentId, { vendor_name: 'X' })).status).toBe(409);
    });
  });
});
