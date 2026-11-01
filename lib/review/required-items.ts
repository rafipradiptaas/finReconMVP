import type { CheckedField } from '@/lib/extraction-checks';
import type { ScoreBreakdown } from '@/lib/matching';
import { CRITICAL_EXTRACTION_FIELDS, FIELD_LABELS } from '@/types/domain';
import { REVIEW_HIGH_AMOUNT } from './config';
import type { ReviewExtraction, ReviewInvoice, ReviewItem, ReviewMatch } from './types';

const SCORE_LABELS: Record<keyof ScoreBreakdown, string> = {
  po_number: 'nomor PO',
  vendor_name: 'nama vendor',
  amount: 'nominal',
  line_items: 'baris item',
  consistency: 'konsistensi',
};

function scoreItems(breakdown: ScoreBreakdown | null): ReviewItem[] {
  if (!breakdown) return [];
  return (Object.keys(SCORE_LABELS) as (keyof ScoreBreakdown)[]).flatMap((name) => {
    const { value, max } = breakdown[name];
    if (value >= max) return [];
    const score = value.toLocaleString('id-ID');
    return [{ id: `score:${name}`, label: `Skor ${SCORE_LABELS[name]} ${score} dari ${max}: sudah diperiksa` }];
  });
}

function fieldItems(extraction: ReviewExtraction): ReviewItem[] {
  if (!extraction) return [];
  const scalar = (Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]).flatMap((name) =>
    extraction.fields[name].verification === 'unverified'
      ? [{ id: `field:${name}`, label: `${FIELD_LABELS[name]} belum terverifikasi: sudah diperiksa` }]
      : [],
  );
  const lines = extraction.fields.line_items.flatMap((line: CheckedField<unknown>, index) =>
    line.verification === 'unverified'
      ? [{ id: `line:${index}`, label: `Baris ${index + 1} belum terverifikasi: sudah diperiksa` }]
      : [],
  );
  return [...scalar, ...lines];
}

/**
 * What a reviewer must tick before approving (product doc 9.2). The rows add
 * up: a high-amount FULL_MATCH with an anomaly needs both sets (D6). An unknown
 * total counts as high.
 */
export function requiredReviewItems(
  match: ReviewMatch,
  invoice: ReviewInvoice,
  extraction: ReviewExtraction,
): ReviewItem[] {
  if (match.status === 'REJECTED') return [];

  const full = match.status === 'FULL_MATCH';
  const highAmount = full && (invoice.total_amount ?? Infinity) >= REVIEW_HIGH_AMOUNT;
  const flagged = !full || match.anomaly_flag;

  return [
    ...(highAmount
      ? CRITICAL_EXTRACTION_FIELDS.map((name) => ({
          id: `evidence:${name}`,
          label: `Bukti ${FIELD_LABELS[name]} sesuai dokumen`,
        }))
      : []),
    ...(flagged ? [...scoreItems(match.score_breakdown), ...fieldItems(extraction)] : []),
    ...(match.anomaly_flag ? [{ id: 'anomaly', label: 'Anomali nominal: sudah diperiksa' }] : []),
  ];
}
