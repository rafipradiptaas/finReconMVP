import 'server-only';
import { logAudit } from '@/lib/audit';
import { explainMatch } from '@/lib/llm/explain-match';
import { llmCallsWriter } from '@/lib/llm/log-call';
import {
  runMatching,
  type HistoryEntry,
  type MatchInvoice,
  type MatchPurchaseOrder,
} from '@/lib/matching';
import { buildComparisons } from '@/lib/review';
import { readAll } from '@/lib/server/read-all';
import type { WriteContext } from '@/lib/server/write-context';
import type { Json } from '@/types/database.types';
import { MATCHING_FAILED_PREFIX } from '@/types/domain';

/**
 * Runs when a document reaches EXTRACTED, by upload or by correction.
 * ponytail: loads the whole organization per match. Filter history by vendor if
 * matching gets slow.
 */
export async function matchDocument(ctx: WriteContext, documentId: string) {
  const { db, organizationId } = ctx;

  const { data: invoice, error: invoiceError } = await db
    .from('invoices')
    .select(
      'id, invoice_number, invoice_date, vendor_name, npwp, po_number, bank_name, bank_account_number, bank_account_holder, subtotal, tax_amount, total_amount, line_items',
    )
    .eq('document_id', documentId)
    .eq('organization_id', organizationId)
    .single();
  if (invoiceError) throw invoiceError;

  const [vendors, orders, matches] = await Promise.all([
    readAll((from, to) =>
      db
        .from('vendors')
        .select(
          'id, vendor_name, npwp, bank_name, bank_account_number, bank_account_holder, status',
        )
        .eq('organization_id', organizationId)
        .order('id')
        .range(from, to),
    ),
    readAll((from, to) =>
      db
        .from('purchase_orders')
        .select(
          'id, po_number, vendor_id, po_date, total_amount, lines:purchase_order_lines(item_description, quantity, unit_price)',
        )
        .eq('organization_id', organizationId)
        .order('id')
        .range(from, to),
    ),
    readAll((from, to) =>
      db
        .from('matches')
        .select(
          'review_status, paid_at, invoices!inner(id, vendor_id, invoice_number_normalized, total_amount)',
        )
        .eq('organization_id', organizationId)
        .order('id')
        .range(from, to),
    ),
  ]);

  const history: HistoryEntry[] = matches.map(({ review_status, paid_at, invoices }) => ({
    invoice_id: invoices.id,
    vendor_id: invoices.vendor_id,
    invoice_number_normalized: invoices.invoice_number_normalized,
    total_amount: invoices.total_amount,
    review_status,
    paid_at,
  }));

  const result = runMatching(
    { ...invoice, line_items: (invoice.line_items ?? []) as MatchInvoice['line_items'] },
    { vendors, purchaseOrders: orders as MatchPurchaseOrder[], history, now: new Date() },
  );

  const { error: linkError } = await db
    .from('invoices')
    .update({ vendor_id: result.vendorId, po_id: result.poId })
    .eq('id', invoice.id)
    .eq('organization_id', organizationId);
  if (linkError) throw linkError;

  const { data: match, error: matchError } = await db
    .from('matches')
    .upsert(
      {
        organization_id: organizationId,
        invoice_id: invoice.id,
        status: result.status,
        veto_code: result.vetoCode,
        score: result.score,
        score_breakdown: result.scoreBreakdown as unknown as Json,
        anomaly_flag: result.anomalyFlag,
        anomaly_reason: result.anomalyReason ?? null,
        // A re-match must not keep the words written about the old result.
        explanation: null,
        review_status: 'PENDING_REVIEW',
      },
      { onConflict: 'invoice_id' },
    )
    .select('id')
    .single();
  if (matchError) throw matchError;

  await logAudit(
    {
      entityType: 'match',
      entityId: match.id,
      action: 'match_completed',
      newValue: {
        document_id: documentId,
        status: result.status,
        veto_code: result.vetoCode,
        score: result.score,
        anomaly_flag: result.anomalyFlag,
        pending_duplicate_warning: result.pendingDuplicateWarning,
      },
    },
    ctx,
  );

  const { error: clearError } = await db
    .from('documents')
    .update({ status_message: null })
    .eq('id', documentId)
    .eq('organization_id', organizationId)
    .like('status_message', `${MATCHING_FAILED_PREFIX}%`);
  if (clearError) throw clearError;

  const comparisons = [
    ...buildComparisons(
      invoice,
      vendors.find(({ id }) => id === result.vendorId) ?? null,
      orders.find(({ id }) => id === result.poId) ?? null,
    ),
    ...(result.anomalyReason
      ? [{ field: 'Anomali', invoiceValue: result.anomalyReason, masterValue: null }]
      : []),
  ];
  await saveExplanation(ctx, match.id, {
    status: result.status,
    vetoCode: result.vetoCode,
    scoreBreakdown: result.scoreBreakdown,
    comparisons,
  });
  return result;
}

/** Runs after the decision is stored. Whatever happens here, the match stands. */
async function saveExplanation(
  ctx: WriteContext,
  matchId: string,
  input: Parameters<typeof explainMatch>[0],
) {
  try {
    const log = llmCallsWriter(ctx.db, ctx.organizationId, { type: 'match', id: matchId });
    const explanation = await explainMatch(input, { log });
    if (explanation === null) return;
    const { error } = await ctx.db
      .from('matches')
      .update({ explanation })
      .eq('id', matchId)
      .eq('organization_id', ctx.organizationId);
    if (error) throw error;
  } catch (error) {
    console.error(error);
  }
}

function failureCode(error: unknown) {
  const { code, name } = (error ?? {}) as { code?: unknown; name?: unknown };
  return String(code || name || 'UNKNOWN');
}

async function recordMatchingFailure(ctx: WriteContext, documentId: string, error: unknown) {
  const statusMessage = `${MATCHING_FAILED_PREFIX} ${failureCode(error)}`;
  try {
    const { error: updateError } = await ctx.db
      .from('documents')
      .update({ status_message: statusMessage })
      .eq('id', documentId)
      .eq('organization_id', ctx.organizationId);
    if (updateError) throw updateError;
    await logAudit(
      {
        entityType: 'document',
        entityId: documentId,
        action: 'matching_failed',
        newValue: {
          status_message: statusMessage,
          error: error instanceof Error ? error.message : String(error),
        },
      },
      ctx,
    );
  } catch (failure) {
    // The database is probably down. No match row is left, so rematch still works.
    console.error(failure);
  }
}

/**
 * A finished extraction stands even when matching throws: the document stays
 * EXTRACTED, marked, and POST /api/documents/[id]/rematch runs it again.
 * Returns whether matching completed.
 */
export async function tryMatchDocument(ctx: WriteContext, documentId: string): Promise<boolean> {
  try {
    await matchDocument(ctx, documentId);
    return true;
  } catch (error) {
    console.error(error);
    await recordMatchingFailure(ctx, documentId, error);
    return false;
  }
}
