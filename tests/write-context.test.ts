import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getSessionContext: async () => session.current }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ admin: true }) }));

const { withWriteContext } = await import('@/lib/server/write-context');

describe('withWriteContext', () => {
  const handler = vi.fn(async () => Response.json({ ok: true }));
  const route = withWriteContext(['admin'], handler);

  beforeEach(() => {
    handler.mockClear();
    session.current = { userId: 'u1', organizationId: 'org1', role: 'admin', fullName: null };
  });

  it('returns 401 without running the handler when there is no session', async () => {
    session.current = null;
    expect((await route()).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 403 without running the handler for the wrong role', async () => {
    session.current = { ...session.current, role: 'ap_staff' };
    expect((await route()).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('hands the session organization and the service client to the handler', async () => {
    expect((await route()).status).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org1', role: 'admin', db: { admin: true } }),
    );
  });

  it('turns a thrown error into a 500 envelope', async () => {
    const failing = withWriteContext(['admin'], async () => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});
    const response = await failing();
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('INTERNAL_ERROR');
  });
});
