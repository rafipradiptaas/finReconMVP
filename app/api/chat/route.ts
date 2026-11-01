import { z } from 'zod';
import { answerQuestion } from '@/lib/chatbot/loop';
import { LlmError } from '@/lib/llm';
import { llmCallsWriter } from '@/lib/llm/log-call';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';
import { createClient } from '@/lib/supabase/server';

const MAX_MESSAGE_CHARS = 2000;
const body = z.object({ message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS) });

export const maxDuration = 60;

// Approver and admin (product doc 11). The wrapper only checks the role and logs
// the calls: every tool reads with the user's client, under RLS.
export const POST = withWriteContext(['approver', 'admin'], async (ctx, request: Request) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, 'VALIDATION_ERROR', 'Pertanyaan wajib diisi.', parsed.error.issues);

  try {
    const { text, toolsCalled } = await answerQuestion(await createClient(), parsed.data.message, {
      log: llmCallsWriter(ctx.db, ctx.organizationId),
    });
    return ok({ text, toolsCalled });
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    return fail(502, 'CHATBOT_UNAVAILABLE', 'Chatbot sedang tidak tersedia. Coba lagi.');
  }
});
