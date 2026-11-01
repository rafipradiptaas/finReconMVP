import {
  AMOUNT_FULL_TOLERANCE,
  AMOUNT_WEIGHT,
  AMOUNT_ZERO_AT,
  CONSISTENCY_ITEM_WEIGHT,
  LINE_DESCRIPTION_MIN,
  LINE_ITEMS_WEIGHT,
  LINE_UNIT_PRICE_TOLERANCE,
  LINES_SUM_TOLERANCE,
  PO_WEIGHT,
  TAX_TOLERANCE_RUPIAH,
  VENDOR_NAME_WEIGHT,
} from './config';
import { normalizeName, normalizePoNumber } from './normalize';
import { jaroWinkler } from './similarity';
import type {
  MatchInvoice,
  MatchLineItem,
  MatchPurchaseOrder,
  MatchVendor,
  ScoreBreakdown,
} from './types';

const round = (value: number) => Math.round(value * 100) / 100;
const cents = (value: number) => Math.round(value * 100);

/** Not found covers missing, not in this organization, and belonging to another vendor. */
export function findPurchaseOrder(
  invoice: MatchInvoice,
  vendor: MatchVendor,
  purchaseOrders: MatchPurchaseOrder[],
): MatchPurchaseOrder | null {
  if (!invoice.po_number) return null;
  const number = normalizePoNumber(invoice.po_number);
  return (
    purchaseOrders.find(
      (po) => po.vendor_id === vendor.id && normalizePoNumber(po.po_number) === number,
    ) ?? null
  );
}

function amountScore(subtotal: number | null, poTotal: number): number {
  if (subtotal === null) return 0;
  const difference = Math.abs(subtotal - poTotal);
  if (difference <= poTotal * AMOUNT_FULL_TOLERANCE) return AMOUNT_WEIGHT;
  if (difference >= poTotal * AMOUNT_ZERO_AT) return 0;
  const relative = difference / poTotal;
  return (AMOUNT_WEIGHT * (AMOUNT_ZERO_AT - relative)) / (AMOUNT_ZERO_AT - AMOUNT_FULL_TOLERANCE);
}

function lineMatches(line: MatchLineItem, poLine: MatchPurchaseOrder['lines'][number]): boolean {
  return (
    jaroWinkler(normalizeName(line.description), normalizeName(poLine.item_description)) >=
      LINE_DESCRIPTION_MIN &&
    line.quantity === poLine.quantity &&
    Math.abs(line.unit_price - poLine.unit_price) <= poLine.unit_price * LINE_UNIT_PRICE_TOLERANCE
  );
}

/** Each PO line can be claimed once, so a repeated invoice line cannot score twice. */
function lineItemsScore(lines: MatchLineItem[], po: MatchPurchaseOrder): number {
  if (lines.length === 0) return 0;
  const open = [...po.lines];
  let matched = 0;
  for (const line of lines) {
    const at = open.findIndex((poLine) => lineMatches(line, poLine));
    if (at === -1) continue;
    open.splice(at, 1);
    matched++;
  }
  return (matched / lines.length) * LINE_ITEMS_WEIGHT;
}

function linesSumOk({ line_items, subtotal }: MatchInvoice): boolean {
  if (line_items.length === 0 || subtotal === null) return false;
  const sum = line_items.reduce((total, line) => total + cents(line.line_subtotal), 0);
  return Math.abs(sum - cents(subtotal)) <= cents(subtotal) * LINES_SUM_TOLERANCE + 1e-6;
}

function taxOk({ subtotal, tax_amount, total_amount }: MatchInvoice): boolean {
  if (subtotal === null || total_amount === null) return false;
  const expected = cents(subtotal + (tax_amount ?? 0));
  return Math.abs(expected - cents(total_amount)) <= TAX_TOLERANCE_RUPIAH * 100;
}

const point = (passed: boolean) => (passed ? CONSISTENCY_ITEM_WEIGHT : 0);

/** The score of an invoice that passed every veto. po is null when not found. */
export function scoreInvoice(
  invoice: MatchInvoice,
  vendor: MatchVendor,
  po: MatchPurchaseOrder | null,
): { score: number; breakdown: ScoreBreakdown } {
  const similarity = jaroWinkler(
    normalizeName(invoice.vendor_name ?? ''),
    normalizeName(vendor.vendor_name),
  );
  const poNumber = po ? PO_WEIGHT : 0;
  const vendorName = similarity * VENDOR_NAME_WEIGHT;
  const amount = po ? amountScore(invoice.subtotal, po.total_amount) : 0;
  const lineItems = po ? lineItemsScore(invoice.line_items, po) : 0;
  const lines_sum = point(linesSumOk(invoice));
  const tax = point(taxOk(invoice));
  const date = point(
    po !== null && invoice.invoice_date !== null && invoice.invoice_date >= po.po_date,
  );
  const consistency = lines_sum + tax + date;

  return {
    score: round(poNumber + vendorName + amount + lineItems + consistency),
    breakdown: {
      po_number: { value: poNumber, max: PO_WEIGHT },
      vendor_name: { value: round(vendorName), max: VENDOR_NAME_WEIGHT },
      amount: { value: round(amount), max: AMOUNT_WEIGHT },
      line_items: { value: round(lineItems), max: LINE_ITEMS_WEIGHT },
      consistency: {
        value: consistency,
        max: 3 * CONSISTENCY_ITEM_WEIGHT,
        lines_sum,
        tax,
        date,
      },
    },
  };
}
