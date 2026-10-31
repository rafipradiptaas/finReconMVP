import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureOrgId } from './helpers/fixture-org';

/**
 * Runs the real route handlers against the real database, in the fixture
 * organization (D22). logAudit is mocked: audit rows can never be deleted, and
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

const { PATCH } = await import('@/app/api/vendors/[id]/status/route');
const { POST: importPos } = await import('@/app/api/purchase-orders/import/route');

const stamp = Date.now();
const vendorCode = `ROUTE-${stamp}`;
const poNumber = `ROUTE-PO-${stamp}`;
const freePoNumber = `ROUTE-FREE-${stamp}`;
const today = new Date().toISOString().slice(0, 10);

describe.skipIf(!url || !serviceKey)('vendor and PO routes (D22)', () => {
  let admin: SupabaseClient;
  let org: string;
  let vendorId: string;
  let poId: string;
  let documentId: string;

  const patchStatus = (status: string) =>
    PATCH(
      new Request('http://test.local', { method: 'PATCH', body: JSON.stringify({ status }) }),
      { params: Promise.resolve({ id: vendorId }) },
    );

  async function setVendor(values: Record<string, unknown>) {
    const { error } = await admin.from('vendors').update(values).eq('id', vendorId);
    if (error) throw error;
  }

  async function readVendor() {
    const { data, error } = await admin
      .from('vendors')
      .select('status, last_verified_at')
      .eq('id', vendorId)
      .single();
    if (error) throw error;
    return data;
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    org = await fixtureOrgId(admin);

    const insertOne = async (table: string, row: Record<string, unknown>) => {
      const { data, error } = await admin
        .from(table)
        .insert({ ...row, organization_id: org })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    };

    vendorId = await insertOne('vendors', { vendor_code: vendorCode, vendor_name: 'Vendor Route' });
    poId = await insertOne('purchase_orders', {
      po_number: poNumber,
      vendor_id: vendorId,
      po_date: '2026-01-01',
    });
    await insertOne('purchase_order_lines', {
      po_id: poId,
      line_no: 1,
      item_description: 'Lama',
      quantity: 1,
      unit_price: 1000,
    });
    documentId = await insertOne('documents', {
      storage_path: `${org}/route.pdf`,
      original_filename: 'route.pdf',
      mime_type: 'application/pdf',
    });
    await insertOne('invoices', { document_id: documentId, po_id: poId });
  });

  afterAll(async () => {
    if (!admin) return;
    if (documentId) await admin.from('documents').delete().eq('id', documentId);
    if (poId) await admin.from('purchase_orders').delete().eq('id', poId);
    await admin.from('purchase_orders').delete().eq('organization_id', org).eq('po_number', freePoNumber);
    if (vendorId) await admin.from('vendors').delete().eq('id', vendorId);
  });

  beforeEach(() => {
    mocks.logAudit.mockClear();
    mocks.session = { userId: 'u1', organizationId: org, role: 'approver', fullName: null };
  });

  it('sets last_verified_at to today and audits it when verifying', async () => {
    await setVendor({ status: 'unverified', last_verified_at: '2020-01-01' });

    expect((await patchStatus('verified')).status).toBe(200);

    expect(await readVendor()).toEqual({ status: 'verified', last_verified_at: today });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'vendor_status_changed',
        oldValue: { status: 'unverified', last_verified_at: '2020-01-01' },
        newValue: { status: 'verified', last_verified_at: today },
      }),
      expect.anything(),
    );
  });

  it('leaves last_verified_at alone for any other status', async () => {
    await setVendor({ status: 'verified', last_verified_at: '2020-01-01' });

    expect((await patchStatus('suspended')).status).toBe(200);

    expect(await readVendor()).toEqual({ status: 'suspended', last_verified_at: '2020-01-01' });
  });

  it('rejects a whole PO file when one PO is already referenced by an invoice', async () => {
    mocks.session = { ...mocks.session, role: 'admin' };
    const csv = [
      'po_number,vendor_code,po_date,line_no,item_description,quantity,unit_price,currency',
      `${poNumber},${vendorCode},2026-01-01,1,Baru,1,9999,IDR`,
      `${freePoNumber},${vendorCode},2026-01-01,1,Bebas,1,1,IDR`,
    ].join('\n');
    const form = new FormData();
    form.append('file', new File([csv], 'po.csv', { type: 'text/csv' }));

    const response = await importPos(new Request('http://test.local', { method: 'POST', body: form }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.details.errors).toEqual([
      { row: 2, column: 'po_number', message: 'PO sudah dipakai invoice, tidak bisa diimpor ulang' },
    ]);

    const { data: lines } = await admin.from('purchase_order_lines').select('unit_price').eq('po_id', poId);
    expect(lines).toEqual([{ unit_price: 1000 }]);
    const { data: free } = await admin
      .from('purchase_orders')
      .select('id')
      .eq('organization_id', org)
      .eq('po_number', freePoNumber);
    expect(free).toEqual([]);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});
