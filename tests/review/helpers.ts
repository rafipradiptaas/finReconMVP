import type { CheckedField, CheckedInvoice } from '@/lib/extraction-checks';
import type { ReviewMatch } from '@/lib/review';
import type { ScoreBreakdown } from '@/lib/matching';
import type { FieldVerification } from '@/types/domain';

export const fullBreakdown = (): ScoreBreakdown => ({
  po_number: { value: 25, max: 25 },
  vendor_name: { value: 15, max: 15 },
  amount: { value: 25, max: 25 },
  line_items: { value: 20, max: 20 },
  consistency: { value: 15, max: 15, lines_sum: 5, tax: 5, date: 5 },
});

export const match = (over: Partial<ReviewMatch> = {}): ReviewMatch => ({
  status: 'FULL_MATCH',
  review_status: 'PENDING_REVIEW',
  anomaly_flag: false,
  score_breakdown: fullBreakdown(),
  ...over,
});

const field = <T>(value: T, verification: FieldVerification = 'verified'): CheckedField<T> => ({
  value,
  confidence: 'high',
  source_text: String(value),
  signals: { grounded: true, format_ok: true, arithmetic_ok: true },
  evidence: [],
  verification,
});

export const fields = (over: Partial<CheckedInvoice> = {}): CheckedInvoice => ({
  invoice_number: field('INV-1'),
  invoice_date: field('2026-07-21'),
  vendor_name: field('PT Satu'),
  npwp: field('012345678912000'),
  po_number: field('PO-1'),
  bank_name: field('BCA'),
  bank_account_number: field('1234567890'),
  bank_account_holder: field('PT Satu'),
  subtotal: field(1000),
  tax_amount: field(110),
  total_amount: field(1110),
  line_items: [field({ description: 'A', quantity: 1, unit_price: 1000, line_subtotal: 1000 })],
  ...over,
});

export { field };
