import type { Email, EmailResult } from '.';

const ENDPOINT = 'https://api.resend.com/emails';

// A few lines of fetch instead of the SDK, for one plain-text POST.
export async function sendWithResend({ to, subject, body }: Email): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text: body }),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
  const { id } = (await response.json()) as { id: string };
  return { providerMessageId: id };
}
