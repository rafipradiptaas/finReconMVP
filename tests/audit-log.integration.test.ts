import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { parseAuditFilters } from '@/lib/audit-filters';

/** The route reads through the client it is given. RLS on audit_logs is in rls.integration. */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const mocks = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  client: null as unknown,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getSessionContext: async () => mocks.session }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));

const { GET } = await import('@/app/api/audit-log/export/route');

const exportLog = (query = '') => GET(new Request(`http://test.local/api/audit-log/export${query}`));

describe('parseAuditFilters', () => {
  it('keeps valid values and ignores invalid ones', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(
      parseAuditFilters({ entity_type: 'match', entity_id: id, action: ' review_decided ', from: '2026-11-01', to: '2026-11-02', page: '3' }),
    ).toEqual({ entity_type: 'match', entity_id: id, action: 'review_decided', from: '2026-11-01', to: '2026-11-02' });
    expect(parseAuditFilters({ entity_id: 'nope', from: 'kemarin', action: '' })).toEqual({});
    expect(parseAuditFilters({ entity_type: ['a', 'b'] })).toEqual({});
  });
});

describe('GET /api/audit-log/export', () => {
  afterEach(() => {
    mocks.session = null;
  });

  it('needs a session', async () => {
    expect((await exportLog()).status).toBe(401);
  });

  it('refuses ap_staff', async () => {
    mocks.session = { userId: 'x', organizationId: 'y', role: 'ap_staff', fullName: null };
    expect((await exportLog()).status).toBe(403);
  });

  describe.skipIf(!url || !serviceKey)('against the real database', () => {
    beforeAll(() => {
      mocks.client = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    });

    it.each(['admin', 'approver'])('gives %s a CSV, filtered by the query', async (role) => {
      mocks.session = { userId: 'x', organizationId: 'y', role, fullName: null };
      const response = await exportLog('?action=history_imported&entity_type=invoice');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/csv');
      const [header, ...rows] = (await response.text()).trim().split('\r\n');
      expect(header).toContain('action');
      for (const row of rows) expect(row).toContain('history_imported');
    });
  });
});
