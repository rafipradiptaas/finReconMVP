import 'server-only';
import { logAudit } from '@/lib/audit';
import {
  runMatching,
  type HistoryEntry,
  type MatchInvoice,
  type MatchPurchaseOrder,
} from '@/lib/matching';
import type { WriteContext } from '@/lib/server/write-context';
import type { Json } from '@/types/database.types';

const PAGE_SIZE = 1000;

/**
 * PostgREST caps a response at 1000 rows, and a short read here would silently
 * miss a duplicate, so every list is paged to the end.
 * ponytail: loads the whole organization per match. Filter history by vendor if
 * matching gets slow.
 */
async function readAll<Row>(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
}

/** Runs when a document reaches EXTRACTED, by upload or by correction. */
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
  return result;
}
