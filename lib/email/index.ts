import { sendWithDryRun } from './dry-run';
import { sendWithResend } from './resend';

export type Email = { to: string; subject: string; body: string };
export type EmailResult = { providerMessageId: string };

/** EMAIL_MODE selects the transport, dry_run by default. Anything else is refused. */
export function sendEmail(email: Email): Promise<EmailResult> {
  const mode = process.env.EMAIL_MODE || 'dry_run';
  if (mode === 'dry_run') return sendWithDryRun();
  if (mode === 'resend') return sendWithResend(email);
  return Promise.reject(new Error(`Unknown EMAIL_MODE: ${mode}`));
}
