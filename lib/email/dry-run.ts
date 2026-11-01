import type { EmailResult } from '.';

/** Stores without sending: the follow-up is SENT, and nothing left the building. */
export async function sendWithDryRun(): Promise<EmailResult> {
  return { providerMessageId: 'dry_run' };
}
