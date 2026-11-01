import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

/**
 * Every fixture invoice through the running app, in one organization.
 *
 *   npm run test:e2e                                        fixture organization, cleaned up after
 *   E2E_ORG="Demo Corp" npm run test:e2e -- -g "06_anomaly"  one fixture in Demo Corp
 *
 * An organization with no vendors is seeded through the import routes and
 * emptied again afterwards. One that has master data keeps it, and gets the
 * history import, which is idempotent. Documents this run uploads are always
 * removed. Their audit rows stay: audit_logs is append-only.
 *
 * Users are permanent (`e2e-<role>-<org>@finrecon.test`), because a user with
 * audit rows cannot be deleted (D21). Their password is reset on every run.
 */
const ORG = process.env.E2E_ORG ?? 'RLS Audit Fixture (do not delete)';
const CORRECTED_INVOICE_NUMBER = 'INV-BKP-0728';

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type Expected = {
  document_status: string;
  match_status: string | null;
  veto_code: string | null;
  anomaly_flag: boolean;
  after_manual_correction?: string;
};
const truth = JSON.parse(readFileSync('fixtures/invoices/ground-truth.json', 'utf8')) as Record<
  string,
  { expected: Expected }
>;
const FIXTURES = Object.keys(truth).sort();
const fixturePath = (name: string) => `fixtures/invoices/${name}`;

function must<Result extends { data: unknown; error: unknown }>({ data, error }: Result) {
  if (error) throw error;
  return data as NonNullable<Result['data']>;
}

async function ensureUser(organizationId: string, role: Database['public']['Enums']['user_role']) {
  const slug = ORG.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const email = `e2e-${role}-${slug}@finrecon.test`;
  const password = randomBytes(18).toString('base64url');
  const { users } = must(await admin.auth.admin.listUsers({ perPage: 1000 }));
  const existing = users.find((user) => user.email === email);
  const id = existing
    ? (must(await admin.auth.admin.updateUserById(existing.id, { password })), existing.id)
    : must(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user!.id;
  must(
    await admin
      .from('profiles')
      .upsert({ id, organization_id: organizationId, role, full_name: `E2E ${role}` }, { ignoreDuplicates: true })
      .select('id'),
  );
  return { email, password };
}

async function signIn(browser: Browser, { email, password }: { email: string; password: string }) {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1300 } })).newPage();
  await page.goto('/login');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login')), page.click('button[type=submit]')]);
  return page;
}

async function importCsv(request: APIRequestContext, endpoint: string, path: string) {
  const response = await request.post(endpoint, {
    multipart: { file: { name: 'import.csv', mimeType: 'text/csv', buffer: readFileSync(path) } },
  });
  expect(response.status(), `${endpoint} ${await response.text()}`).toBe(200);
  return (await response.json()).data;
}

test.describe.configure({ mode: 'serial' });

test.describe(`fixture invoices in ${ORG}`, () => {
  let organizationId: string;
  let seeded = false;
  let staff: Page;
  let adminPage: Page;
  const uploaded: string[] = [];
  const ids: Record<string, string> = {};
  const pageErrors: string[] = [];

  async function upload(name: string, as = name) {
    const response = await staff.request.post('/api/documents/upload', {
      multipart: { file: { name: as, mimeType: 'application/pdf', buffer: readFileSync(fixturePath(name)) } },
    });
    expect(response.status()).toBe(201);
    const { data } = await response.json();
    uploaded.push(data.documentId);
    return data.documentId as string;
  }

  async function stateOf(id: string) {
    const document = must(await admin.from('documents').select('status').eq('id', id).single());
    const invoice = must(
      await admin
        .from('invoices')
        .select('id, matches(id, status, veto_code, score, anomaly_flag, anomaly_reason)')
        .eq('document_id', id)
        .maybeSingle(),
    );
    return { status: document.status, match: invoice?.matches ?? null };
  }

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const [organization] = must(await admin.from('organizations').select('id').eq('name', ORG).limit(1));
    expect(organization, `organization "${ORG}"`).toBeTruthy();
    organizationId = organization.id;

    staff = await signIn(browser, await ensureUser(organizationId, 'ap_staff'));
    adminPage = await signIn(browser, await ensureUser(organizationId, 'admin'));
    staff.on('pageerror', (error) => pageErrors.push(String(error)));

    const { count } = await admin
      .from('vendors')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
    seeded = count === 0;
    if (seeded) {
      await importCsv(adminPage.request, '/api/vendors/import', 'fixtures/vendors.csv');
      await importCsv(adminPage.request, '/api/purchase-orders/import', 'fixtures/purchase_orders.csv');
    }
    const history = await importCsv(adminPage.request, '/api/history/import', 'fixtures/invoice_history.csv');
    expect(history.rows).toBe(138);
  });

  test.afterAll(async () => {
    if (uploaded.length > 0) {
      await admin.storage.from('documents').remove(uploaded.map((id) => `${organizationId}/${id}.pdf`));
      await admin.from('llm_calls').delete().in('entity_id', uploaded);
      await admin.from('documents').delete().in('id', uploaded);
    }
    if (seeded) {
      await admin.from('invoices').delete().eq('organization_id', organizationId).eq('imported_history', true);
      await admin.from('purchase_orders').delete().eq('organization_id', organizationId);
      await admin.from('vendors').delete().eq('organization_id', organizationId);
    }
    expect(pageErrors).toEqual([]);
  });

  for (const name of FIXTURES) {
    test(name, async () => {
      const expected = truth[name].expected;
      const id = await upload(name);
      ids[name.slice(0, 2)] = id;

      const state = await stateOf(id);
      expect(state.status).toBe(expected.document_status);
      expect(state.match?.status ?? null).toBe(expected.match_status);
      expect(state.match?.veto_code ?? null).toBe(expected.veto_code);
      expect(state.match?.anomaly_flag ?? false).toBe(expected.anomaly_flag);
      if (expected.anomaly_flag) expect(state.match?.anomaly_reason).toContain('rata-rata');
    });
  }

  test('evidence viewer draws the PDF and highlights a hovered field', async () => {
    test.skip(!ids['01'], 'needs fixture 01');
    await staff.goto(`/documents/${ids['01']}`);
    await staff.waitForSelector('canvas');
    await expect(staff.locator('.ring-yellow-500').first()).toBeVisible();
    const dark = await staff.evaluate(() => {
      const canvas = document.querySelector('canvas')!;
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      return pixels.filter((value, index) => index % 4 === 0 && value < 128).length;
    });
    expect(dark).toBeGreaterThan(0);

    const all = await staff.locator('.ring-yellow-500').count();
    await staff.getByRole('row', { name: /Subtotal/ }).hover();
    await expect(staff.locator('.ring-yellow-500')).not.toHaveCount(all);
  });

  test('correction form moves fixture 04 to FULL_MATCH', async () => {
    test.skip(!ids['04'], 'needs fixture 04');
    await staff.goto(`/documents/${ids['04']}`);
    await staff.getByLabel('Nomor invoice').fill(CORRECTED_INVOICE_NUMBER);
    await staff.getByRole('button', { name: 'Simpan koreksi' }).click();
    await expect(staff.locator('h1').locator('..')).toContainText('Terekstraksi');
    expect((await stateOf(ids['04'])).match?.status).toBe('FULL_MATCH');
  });

  test('a twin warns while pending and is vetoed once the first is approved', async () => {
    test.skip(!ids['01'], 'needs fixture 01');
    const twin = await upload(FIXTURES[0], 'twin-while-pending.pdf');
    expect((await stateOf(twin)).match?.status).toBe('FULL_MATCH');
    await staff.goto('/matches');
    await expect(staff.getByText('Ada invoice sama yang menunggu review').first()).toBeVisible();

    const first = await stateOf(ids['01']);
    must(await admin.from('matches').update({ review_status: 'APPROVED' }).eq('id', first.match!.id).select('id'));
    const late = await upload(FIXTURES[0], 'twin-after-approval.pdf');
    const state = await stateOf(late);
    expect(state.match?.status).toBe('REJECTED');
    expect(state.match?.veto_code).toBe('VETO_DUPLICATE_INVOICE');
  });

  test('a failed match shows the rerun button, which restores it', async () => {
    test.skip(!ids['01'], 'needs fixture 01');
    const id = ids['05'];
    const { match } = await stateOf(id);
    must(await admin.from('matches').delete().eq('id', match!.id).select('id'));
    must(
      await admin
        .from('documents')
        .update({ status_message: 'MATCHING_FAILED: E2E' })
        .eq('id', id)
        .select('id'),
    );

    await staff.goto('/matches');
    await staff.getByRole('button', { name: 'Matching gagal — jalankan ulang' }).click();
    await expect.poll(async () => (await stateOf(id)).match?.status).toBe('FULL_MATCH');
    await expect(staff.getByText('Matching gagal')).toHaveCount(0);
  });

  test('/matches lists uploads and hides imported history', async () => {
    test.skip(uploaded.length < FIXTURES.length, 'needs every fixture');
    await staff.goto('/matches');
    const withMatch = await admin
      .from('invoices')
      .select('id, matches!inner(id)', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('imported_history', false);
    await expect(staff.locator('tbody tr')).toHaveCount(withMatch.count!);
  });

  test('every extraction is logged in llm_calls', async () => {
    test.skip(uploaded.length === 0, 'nothing uploaded');
    const calls = must(await admin.from('llm_calls').select('ok, purpose').in('entity_id', uploaded));
    expect(calls.filter(({ purpose, ok }) => purpose === 'extract_invoice' && ok).length).toBeGreaterThan(0);
  });
});
