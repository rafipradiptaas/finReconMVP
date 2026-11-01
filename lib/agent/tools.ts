import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { LlmTool } from '@/lib/llm';
import { normalizePoNumber } from '@/lib/matching/normalize';
import { loadReview } from '@/lib/server/review-context';
import type { Database } from '@/types/database.types';

/**
 * Every tool the follow-up agent has, and all it can do.
 *
 * - Nothing here sends email, and nothing writes a vendor, bank, invoice, match
 *   or status. There is no tool for it, so no prompt can ask for it.
 * - db is the user-scoped client: RLS applies to every read. This file never
 *   sees the service-role client or the email module.
 * - matchId and organizationId are bound here by the server. No tool takes an
 *   id, so the model cannot point a tool at another record.
 * - The two writes (a draft, a reply's findings) are callbacks owned by
 *   lib/server/followups.ts, which takes organization_id from the session.
 */
export type AgentScope = {
  db: SupabaseClient<Database>;
  organizationId: string;
  matchId: string;
};

export type ReplyFindings = {
  proposedPoNumber: string | null;
  proposedPoValid: boolean | null;
  suspicions: string[];
};

const defineTool = <Schema extends z.ZodType>(tool: LlmTool<Schema>) => tool as unknown as LlmTool;

/** An explicit list of what the model sees. contact_email is not on it (product doc 10.2). */
export async function readFollowupContext({ db, organizationId, matchId }: AgentScope) {
  const review = await loadReview(db, organizationId, matchId);
  if (!review) throw new Error('Match not found');
  const { match, invoice } = review;

  const [{ data: vendor }, { data: po }] = await Promise.all([
    invoice.vendor_id
      ? db.from('vendors').select('vendor_code, vendor_name').eq('id', invoice.vendor_id).maybeSingle()
      : { data: null },
    invoice.po_id
      ? db.from('purchase_orders').select('po_number, po_date, total_amount').eq('id', invoice.po_id).maybeSingle()
      : { data: null },
  ]);

  return {
    match: { status: match.status, veto_code: match.veto_code, review_status: match.review_status },
    flagged_items: review.requiredItems.map(({ label }) => label),
    invoice: {
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      po_number: invoice.po_number,
      subtotal: invoice.subtotal,
      tax_amount: invoice.tax_amount,
      total_amount: invoice.total_amount,
      bank_name: invoice.bank_name,
      bank_account_number: invoice.bank_account_number,
      bank_account_holder: invoice.bank_account_holder,
    },
    vendor,
    purchase_order: po,
  };
}

function getFollowupContext(scope: AgentScope) {
  return defineTool({
    name: 'get_followup_context',
    description: 'Reads the invoice, vendor, purchase order, status and flagged items of this follow-up.',
    inputSchema: z.object({}),
    execute: () => readFollowupContext(scope),
  });
}

export function draftTools(
  scope: AgentScope,
  saveDraft: (draft: { subject: string; body: string }) => Promise<void>,
): LlmTool[] {
  return [
    getFollowupContext(scope),
    defineTool({
      name: 'save_draft',
      description: 'Saves the email draft for a person to review. It does not send anything.',
      inputSchema: z.object({ subject: z.string().trim().min(1), body: z.string().trim().min(1) }),
      execute: async (draft) => {
        await saveDraft(draft);
        return { saved: true };
      },
    }),
  ];
}

export function replyTools(scope: AgentScope, replyText: string, findings: ReplyFindings): LlmTool[] {
  return [
    getFollowupContext(scope),
    defineTool({
      name: 'propose_po_number',
      description: 'Suggests the purchase order number stated in the reply. A person decides whether to accept it.',
      inputSchema: z.object({ po_number: z.string().trim().min(1), evidence_text: z.string() }),
      execute: async ({ po_number }) => {
        // Code decides validity: the number is in the email, and is a PO of this
        // invoice's vendor. Being in the email stops the model inventing one.
        const wanted = normalizePoNumber(po_number);
        const review = await loadReview(scope.db, scope.organizationId, scope.matchId);
        const vendorId = review?.invoice.vendor_id;
        const { data: orders, error } = vendorId
          ? await scope.db.from('purchase_orders').select('po_number').eq('vendor_id', vendorId)
          : { data: [], error: null };
        if (error) throw error;

        const order = orders?.find((candidate) => normalizePoNumber(candidate.po_number) === wanted);
        const valid = Boolean(order) && normalizePoNumber(replyText).includes(wanted);
        if (!findings.proposedPoValid) {
          findings.proposedPoNumber = order?.po_number ?? po_number;
          findings.proposedPoValid = valid;
        }
        return { valid };
      },
    }),
    defineTool({
      name: 'flag_suspicious',
      description: 'Adds a warning for the reviewer. It changes no data.',
      inputSchema: z.object({ reason: z.string().trim().min(1) }),
      execute: async ({ reason }) => {
        findings.suspicions.push(reason);
        return { flagged: true };
      },
    }),
  ];
}
