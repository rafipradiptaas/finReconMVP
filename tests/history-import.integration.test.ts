import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureOrgId } from './helpers/fixture-org';

/** The real route against the real database, in the fixture organization (D22). */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const mocks = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  logAudit: vi.fn(async () => {}),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getSessionContext: async () => mocks.session }));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));

const { POST } = await import('@/app/api/history/import/route');

const stamp = Date.now();
const vendorCode = `HIST-${stamp}`;
const HEADER = 'vendor_code,invoice_number,invoice_date,po_number,total_amount,paid_date';
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');
const FILE = csv(
  `${vendorCode},H/${stamp}-1,2026-01-01,PO-H-1,1000000,2026-01-20`,
  `${vendorCode},H/${stamp}-1,2026-01-09,PO-H-1,1000000,2026-01-25`,
  `${vendorCode},H/${stamp}-2,2026-02-01,,2500000.50,2026-02-20`,
);

function post(text: string) {
  const form = new FormData();
  form.append('file', new File([text], 'history.csv', { type: 'text/csv' }));
  return POST(new Request('http://test.local', { method: 'POST', body: form }));
}

describe.skipIf(!url || !serviceKey)('POST /api/history/import', () => {
  let admin: SupabaseClient;
  let org: string;
  let vendorId: string;

  const imported = async () => {
    const { data, error } = await admin
      .from('invoices')
      .select('*, matches(status, review_status, paid_at, score)')
      .eq('vendor_id', vendorId)
      .order('invoice_date');
    if (error) throw error;
    return data;
  };

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    org = await fixtureOrgId(admin);
    const { data, error } = await admin
      .from('vendors')
      .insert({ organization_id: org, vendor_code: vendorCode, vendor_name: `PT Histori ${stamp}`, status: 'verified' })
      .select('id')
      .single();
    if (error) throw error;
    vendorId = data.id;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from('invoices').delete().eq('vendor_id', vendorId);
    await admin.from('vendors').delete().eq('id', vendorId);
  });

  beforeEach(() => {
    mocks.logAudit.mockClear();
    mocks.session = { userId: 'admin-id', organizationId: org, role: 'admin', fullName: null };
  });

  it.each(['ap_staff', 'approver'])('refuses %s', async (role) => {
    mocks.session = { userId: 'someone', organizationId: org, role, fullName: null };
    expect((await post(FILE)).status).toBe(403);
    expect(await imported()).toHaveLength(0);
  });

  it('rejects a whole file for one bad row', async () => {
    const response = await post(csv(`${vendorCode},H,2026-01-01,,10,2026-01-20`, 'NOPE,H,2026-01-01,,10,2026-01-20'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.details.errors).toEqual([
      { row: 3, column: 'vendor_code', message: 'vendor_code tidak ada di master vendor' },
    ]);
    expect(await imported()).toHaveLength(0);
  });

  it('creates PAID history invoices with no document, and audits the batch', async () => {
    const response = await post(FILE);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ rows: 3, created: 3, skipped: 0 });

    const rows = await imported();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      organization_id: org,
      document_id: null,
      imported_history: true,
      vendor_name: `PT Histori ${stamp}`,
      invoice_number: `H/${stamp}-1`,
      invoice_number_normalized: `H${stamp}1`,
      invoice_date: '2026-01-01',
      po_number: 'PO-H-1',
      po_id: null,
      total_amount: 1000000,
    });
    expect(rows[2]).toMatchObject({ po_number: null, total_amount: 2500000.5 });
    for (const row of rows) {
      expect(row.matches).toMatchObject({ status: 'FULL_MATCH', review_status: 'PAID', score: null });
    }
    expect(rows[0].matches.paid_at.slice(0, 10)).toBe('2026-01-20');
    expect(mocks.logAudit).toHaveBeenCalledExactlyOnceWith(
      {
        entityType: 'invoice',
        action: 'history_imported',
        newValue: { rows: 3, created: 3, skipped: 0 },
      },
      expect.anything(),
    );
  });

  it('adds nothing on a second import, and only new rows on a longer file', async () => {
    expect((await (await post(FILE)).json()).data).toEqual({ rows: 3, created: 0, skipped: 3 });
    expect(await imported()).toHaveLength(3);

    const longer = `${FILE}\n${vendorCode},H/${stamp}-3,2026-03-01,,10,2026-03-20`;
    expect((await (await post(longer)).json()).data).toEqual({ rows: 4, created: 1, skipped: 3 });
    expect(await imported()).toHaveLength(4);
  });
});
