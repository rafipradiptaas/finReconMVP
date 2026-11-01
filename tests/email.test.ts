import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from '@/lib/email';

const email = { to: 'finance@vendor.example', subject: 'Halo', body: 'Isi' };

describe('sendEmail', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([undefined, 'dry_run'])('EMAIL_MODE=%s sends nothing', async (mode) => {
    if (mode) vi.stubEnv('EMAIL_MODE', mode);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendEmail(email)).resolves.toEqual({ providerMessageId: 'dry_run' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an unknown mode rather than sending', async () => {
    vi.stubEnv('EMAIL_MODE', 'live');
    await expect(sendEmail(email)).rejects.toThrow('EMAIL_MODE');
  });

  describe('EMAIL_MODE=resend', () => {
    const resend = () => {
      vi.stubEnv('EMAIL_MODE', 'resend');
      vi.stubEnv('RESEND_API_KEY', 're_test');
      vi.stubEnv('EMAIL_FROM', 'ap@finrecon.example');
    };

    it('posts one plain-text email and returns the provider id', async () => {
      resend();
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      await expect(sendEmail(email)).resolves.toEqual({ providerMessageId: 'msg_1' });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('https://api.resend.com/emails');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
      expect(JSON.parse(init.body as string)).toEqual({
        from: 'ap@finrecon.example',
        to: ['finance@vendor.example'],
        subject: 'Halo',
        text: 'Isi',
      });
    });

    it('throws on a provider error', async () => {
      resend();
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 422 })));
      await expect(sendEmail(email)).rejects.toThrow('422');
    });

    it('throws without a key', async () => {
      vi.stubEnv('EMAIL_MODE', 'resend');
      vi.stubEnv('RESEND_API_KEY', '');
      await expect(sendEmail(email)).rejects.toThrow('RESEND_API_KEY');
    });
  });
});
