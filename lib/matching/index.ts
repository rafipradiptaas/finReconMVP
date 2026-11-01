import { checkAnomaly } from './anomaly';
import { classify } from './classify';
import { findPurchaseOrder, scoreInvoice } from './scoring';
import type {
  HistoryEntry,
  MatchInvoice,
  MatchPurchaseOrder,
  MatchResult,
  MatchVendor,
} from './types';
import { checkVeto, identifyVendor } from './veto';

export type {
  HistoryEntry,
  MatchInvoice,
  MatchPurchaseOrder,
  MatchResult,
  MatchVendor,
  ScoreBreakdown,
} from './types';

type MatchingContext = {
  vendors: MatchVendor[];
  purchaseOrders: MatchPurchaseOrder[];
  history: HistoryEntry[];
  now: Date;
};

/** The fixed order: veto → score → classify → anomaly (product doc 7). Pure. */
export function runMatching(
  invoice: MatchInvoice,
  { vendors, purchaseOrders, history, now }: MatchingContext,
): MatchResult {
  const vendor = identifyVendor(invoice, vendors);
  const po = vendor && findPurchaseOrder(invoice, vendor, purchaseOrders);
  const { vetoCode, pendingDuplicateWarning } = checkVeto(invoice, vendor, history);
  const ids = { vendorId: vendor?.id ?? null, poId: po?.id ?? null };

  if (vetoCode || !vendor) {
    return {
      ...ids,
      status: 'REJECTED',
      vetoCode,
      score: null,
      scoreBreakdown: null,
      anomalyFlag: false,
      pendingDuplicateWarning,
    };
  }

  const { score, breakdown } = scoreInvoice(invoice, vendor, po);
  return {
    ...ids,
    status: classify(score, po !== null),
    vetoCode: null,
    score,
    scoreBreakdown: breakdown,
    pendingDuplicateWarning,
    ...checkAnomaly(invoice.total_amount, vendor.id, history, now),
  };
}

type DuplicateRow = Pick<
  HistoryEntry,
  'invoice_id' | 'vendor_id' | 'invoice_number_normalized' | 'review_status'
>;

/**
 * Invoices with a twin still at PENDING_REVIEW. Read at display time, so the
 * warning clears the moment the twin is decided.
 */
export function pendingDuplicateInvoices(rows: DuplicateRow[]): Set<string> {
  const pending = new Map<string, string[]>();
  const keyOf = ({ vendor_id, invoice_number_normalized }: DuplicateRow) =>
    vendor_id && invoice_number_normalized ? `${vendor_id}|${invoice_number_normalized}` : null;

  for (const row of rows) {
    const key = keyOf(row);
    if (key && row.review_status === 'PENDING_REVIEW') {
      pending.set(key, [...(pending.get(key) ?? []), row.invoice_id]);
    }
  }
  return new Set(
    rows
      .filter((row) => {
        const key = keyOf(row);
        return key && pending.get(key)?.some((id) => id !== row.invoice_id);
      })
      .map((row) => row.invoice_id),
  );
}
