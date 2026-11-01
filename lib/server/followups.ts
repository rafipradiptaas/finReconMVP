import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runDraftAgent, runReplyAgent } from '@/lib/agent/loop';
import { logAudit } from '@/lib/audit';
import { sendEmail } from '@/lib/email';
import { detectBankChangeRequest, isFollowupEligible } from '@/lib/followup-checks';
import { LlmError } from '@/lib/llm';
import { llmCallsWriter } from '@/lib/llm/log-call';
import type { WriteContext } from '@/lib/server/write-context';
import type { Database, Json } from '@/types/database.types';

type UserDb = SupabaseClient<Database>;
type Failure = { ok: false; status: number; code: string; message: string };

const failure = (status: number, code: string, message: string): Failure => ({ ok: false, status, code, message });
const NOT_FOUND = failure(404, 'NOT_FOUND', 'Follow-up tidak ditemukan.');
const NO_CONTACT = failure(422, 'NO_CONTACT', 'Kontak vendor belum ada. Minta admin melengkapi master data.');

/** The master contact of the invoice's vendor, read fresh. The only recipient there is. */
async function vendorContact(ctx: WriteContext, vendorId: string | null) {
  if (!vendorId) return null;
  const { data, error } = await ctx.db
    .from('vendors')
    .select('contact_email')
    .eq('id', vendorId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  return data?.contact_email ?? null;
}

async function loadFollowup(ctx: WriteContext, id: string) {
  const { data, error } = await ctx.db
    .from('followups')
    .select('*, matches!inner(id, invoices!inner(vendor_id))')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Runs the agent for an eligible match. organization_id comes from the session, never the model. */
export async function createFollowup(ctx: WriteContext, userDb: UserDb, matchId: string) {
  const { data: match, error } = await ctx.db
    .from('matches')
    .select('id, status, veto_code, anomaly_flag, invoices!inner(vendor_id)')
    .eq('id', matchId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!match) return failure(404, 'NOT_FOUND', 'Match tidak ditemukan.');
  if (!isFollowupEligible(match)) {
    return failure(409, 'NOT_ELIGIBLE', 'Match ini tidak memerlukan follow-up.');
  }
  if (!(await vendorContact(ctx, match.invoices.vendor_id))) return NO_CONTACT;

  const { data: open, error: openError } = await ctx.db
    .from('followups')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('match_id', matchId)
    .eq('status', 'DRAFT')
    .limit(1)
    .maybeSingle();
  if (openError) throw openError;
  if (open) return { ok: true as const, id: open.id };

  let id: string | null = null;
  const saveDraft = async ({ subject, body }: { subject: string; body: string }) => {
    const { data, error: insertError } = await ctx.db
      .from('followups')
      .insert({
        organization_id: ctx.organizationId,
        match_id: matchId,
        subject,
        body,
        ai_generated_body: body,
        created_by: ctx.userId,
      })
      .select('id')
      .single();
    if (insertError) throw insertError;
    id = data.id;
  };

  const log = llmCallsWriter(ctx.db, ctx.organizationId, { type: 'match', id: matchId });
  try {
    await runDraftAgent({ db: userDb, organizationId: ctx.organizationId, matchId }, saveDraft, log);
  } catch (agentError) {
    if (!(agentError instanceof LlmError)) throw agentError;
    return failure(502, 'AGENT_FAILED', 'Draft gagal dibuat. Coba lagi.');
  }
  if (!id) return failure(502, 'AGENT_NO_DRAFT', 'Agent tidak menghasilkan draft. Coba lagi.');

  await logAudit({ entityType: 'followup', entityId: id, action: 'followup_created', newValue: { match_id: matchId } }, ctx);
  return { ok: true as const, id };
}

export async function updateFollowup(
  ctx: WriteContext,
  id: string,
  change: { discard: true } | { subject?: string; body?: string },
) {
  const followup = await loadFollowup(ctx, id);
  if (!followup) return NOT_FOUND;

  const values =
    'discard' in change
      ? { status: 'DISCARDED' as const, updated_at: new Date().toISOString() }
      : { ...change, edited: true, updated_at: new Date().toISOString() };
  const { data, error } = await ctx.db
    .from('followups')
    .update(values)
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'DRAFT')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) return failure(409, 'INVALID_TRANSITION', 'Draft ini sudah dikirim atau dibuang.');

  await logAudit(
    'discard' in change
      ? {
          entityType: 'followup',
          entityId: id,
          action: 'followup_discarded',
          oldValue: { status: 'DRAFT' },
          newValue: { status: 'DISCARDED' },
        }
      : {
          entityType: 'followup',
          entityId: id,
          action: 'followup_edited',
          oldValue: { subject: followup.subject, body: followup.body },
          newValue: change,
        },
    ctx,
  );
  return { ok: true as const, id };
}

/**
 * The only path to an email, and it starts with a person's click. The address
 * is re-read here from master data: nothing stored with the draft can steer it.
 */
export async function sendFollowup(ctx: WriteContext, id: string) {
  const followup = await loadFollowup(ctx, id);
  if (!followup) return NOT_FOUND;
  if (followup.status !== 'DRAFT') {
    return failure(409, 'INVALID_TRANSITION', 'Draft ini sudah dikirim atau dibuang.');
  }
  const recipient = await vendorContact(ctx, followup.matches.invoices.vendor_id);
  if (!recipient) return NO_CONTACT;

  // Claimed first, so a double click cannot send twice.
  const { data: claimed, error } = await ctx.db
    .from('followups')
    .update({ status: 'SENT', recipient, sent_by: ctx.userId, sent_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'DRAFT')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!claimed) return failure(409, 'INVALID_TRANSITION', 'Draft ini sudah dikirim atau dibuang.');

  let providerMessageId: string;
  try {
    ({ providerMessageId } = await sendEmail({ to: recipient, subject: followup.subject, body: followup.body }));
  } catch (sendError) {
    console.error(sendError);
    const { error: revertError } = await ctx.db
      .from('followups')
      .update({ status: 'DRAFT', recipient: null, sent_by: null, sent_at: null })
      .eq('id', id)
      .eq('organization_id', ctx.organizationId);
    if (revertError) throw revertError;
    return failure(502, 'SEND_FAILED', 'Email gagal dikirim. Draft tetap tersimpan.');
  }

  const { error: providerError } = await ctx.db
    .from('followups')
    .update({ provider_message_id: providerMessageId })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId);
  if (providerError) throw providerError;

  await logAudit(
    {
      entityType: 'followup',
      entityId: id,
      action: 'followup_sent',
      oldValue: { status: 'DRAFT' },
      newValue: { status: 'SENT', recipient, provider_message_id: providerMessageId },
    },
    ctx,
  );
  return { ok: true as const, id, recipient, providerMessageId };
}

/**
 * Stores a pasted reply with its warnings. Detection is deterministic and runs
 * whether or not the model does: an LLM failure only loses the suggestion.
 * No branch here changes a vendor, an invoice or a match.
 */
export async function addReply(ctx: WriteContext, userDb: UserDb, id: string, body: string) {
  const followup = await loadFollowup(ctx, id);
  if (!followup) return NOT_FOUND;
  if (followup.status !== 'SENT') {
    return failure(409, 'INVALID_TRANSITION', 'Balasan hanya bisa ditempel setelah email dikirim.');
  }

  // A follow-up exists only for a match with a known vendor (product doc 10.1).
  const { data: vendor, error } = await ctx.db
    .from('vendors')
    .select('bank_account_number, npwp')
    .eq('id', followup.matches.invoices.vendor_id!)
    .eq('organization_id', ctx.organizationId)
    .single();
  if (error) throw error;

  const detection = detectBankChangeRequest(body, vendor);
  const log = llmCallsWriter(ctx.db, ctx.organizationId, { type: 'followup', id });
  const scope = { db: userDb, organizationId: ctx.organizationId, matchId: followup.match_id };
  const findings = await runReplyAgent(scope, body, log).catch((agentError: unknown) => {
    if (!(agentError instanceof LlmError)) throw agentError;
    return { proposedPoNumber: null, proposedPoValid: null, suspicions: [] };
  });

  const reasons = [
    ...detection.reasons.map((reason) => ({ source: 'rule', reason })),
    ...findings.suspicions.map((reason) => ({ source: 'ai', reason })),
  ];
  const { data: reply, error: insertError } = await ctx.db
    .from('followup_replies')
    .insert({
      organization_id: ctx.organizationId,
      followup_id: id,
      pasted_by: ctx.userId,
      body,
      proposed_po_number: findings.proposedPoNumber,
      proposed_po_valid: findings.proposedPoValid,
      fraud_flag: reasons.length > 0,
      fraud_reasons: reasons as unknown as Json,
    })
    .select('id, proposed_po_number, proposed_po_valid, fraud_flag, fraud_reasons')
    .single();
  if (insertError) throw insertError;

  await logAudit(
    {
      entityType: 'followup',
      entityId: id,
      action: 'followup_reply_added',
      newValue: {
        reply_id: reply.id,
        fraud_flag: reply.fraud_flag,
        fraud_reasons: reply.fraud_reasons,
        proposed_po_number: reply.proposed_po_number,
        proposed_po_valid: reply.proposed_po_valid,
      },
    },
    ctx,
  );
  return { ok: true as const, id: reply.id, reply };
}
