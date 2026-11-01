import { describe, expect, it } from 'vitest';
import { REVIEW_HIGH_AMOUNT, requiredReviewItems } from '@/lib/review';
import { field, fields, fullBreakdown, match } from './helpers';

const LOW = 99_999_999;
const HIGH = 100_000_000;
const EVIDENCE = [
  'evidence:invoice_number',
  'evidence:subtotal',
  'evidence:total_amount',
  'evidence:bank_account_number',
  'evidence:npwp',
];

const ids = (...args: Parameters<typeof requiredReviewItems>) =>
  requiredReviewItems(...args).map(({ id }) => id);

const partial = () =>
  match({
    status: 'PARTIAL_MATCH',
    score_breakdown: { ...fullBreakdown(), amount: { value: 11.11, max: 25 } },
  });

describe('requiredReviewItems (product doc 9.2)', () => {
  it('keeps the threshold at Rp 100.000.000', () => {
    expect(REVIEW_HIGH_AMOUNT).toBe(100_000_000);
  });

  it('FULL_MATCH under the threshold is one click', () => {
    expect(ids(match(), { total_amount: LOW }, { fields: fields() })).toEqual([]);
  });

  it('FULL_MATCH under the threshold ignores unverified fields and imperfect scores', () => {
    const imperfect = match({
      score_breakdown: { ...fullBreakdown(), vendor_name: { value: 14, max: 15 } },
    });
    const unverified = fields({ tax_amount: field(110, 'unverified') });
    expect(ids(imperfect, { total_amount: LOW }, { fields: unverified })).toEqual([]);
  });

  it('FULL_MATCH at the threshold needs evidence for every critical field', () => {
    expect(ids(match(), { total_amount: HIGH }, { fields: fields() })).toEqual(EVIDENCE);
  });

  it('treats an unknown total as high, never as one click', () => {
    expect(ids(match(), { total_amount: null }, { fields: fields() })).toEqual(EVIDENCE);
  });

  it('PARTIAL_MATCH needs each score component below its maximum', () => {
    expect(ids(partial(), { total_amount: LOW }, { fields: fields() })).toEqual(['score:amount']);
  });

  it('NO_MATCH lists every component below its maximum', () => {
    const noMatch = match({
      status: 'NO_MATCH',
      score_breakdown: {
        ...fullBreakdown(),
        po_number: { value: 0, max: 25 },
        amount: { value: 0, max: 25 },
        line_items: { value: 0, max: 20 },
        consistency: { value: 10, max: 15, lines_sum: 5, tax: 5, date: 0 },
      },
    });
    expect(ids(noMatch, { total_amount: LOW }, { fields: fields() })).toEqual([
      'score:po_number',
      'score:amount',
      'score:line_items',
      'score:consistency',
    ]);
  });

  it('adds each unverified field and line, not verified or manual ones', () => {
    const checked = fields({
      tax_amount: field(110, 'unverified'),
      bank_name: field('BCA', 'manual'),
      line_items: [
        field({ description: 'A', quantity: 1, unit_price: 1, line_subtotal: 1 }),
        field({ description: 'B', quantity: 1, unit_price: 1, line_subtotal: 1 }, 'unverified'),
      ],
    });
    expect(ids(partial(), { total_amount: LOW }, { fields: checked })).toEqual([
      'score:amount',
      'field:tax_amount',
      'line:1',
    ]);
  });

  it('does not add critical evidence to PARTIAL_MATCH at a high amount', () => {
    expect(ids(partial(), { total_amount: HIGH }, { fields: fields() })).toEqual(['score:amount']);
  });

  it('an anomaly adds its own item, on a perfect FULL_MATCH too', () => {
    expect(ids(match({ anomaly_flag: true }), { total_amount: LOW }, { fields: fields() })).toEqual(['anomaly']);
  });

  it('an anomaly on FULL_MATCH flags imperfect scores and unverified fields', () => {
    const flagged = match({
      anomaly_flag: true,
      score_breakdown: { ...fullBreakdown(), vendor_name: { value: 14, max: 15 } },
    });
    const unverified = fields({ tax_amount: field(110, 'unverified') });
    expect(ids(flagged, { total_amount: LOW }, { fields: unverified })).toEqual([
      'score:vendor_name',
      'field:tax_amount',
      'anomaly',
    ]);
  });

  it('an anomaly at a high amount also needs critical evidence (D6)', () => {
    expect(ids(match({ anomaly_flag: true }), { total_amount: HIGH }, { fields: fields() })).toEqual([
      ...EVIDENCE,
      'anomaly',
    ]);
  });

  it('an anomaly on PARTIAL_MATCH joins the flagged items', () => {
    const flagged = { ...partial(), anomaly_flag: true };
    expect(ids(flagged, { total_amount: LOW }, { fields: fields() })).toEqual(['score:amount', 'anomaly']);
  });

  it('REJECTED has no approve path, so no items', () => {
    expect(ids(match({ status: 'REJECTED', score_breakdown: null }), { total_amount: HIGH }, { fields: fields() })).toEqual([]);
  });

  it('survives a match with no breakdown or extraction', () => {
    expect(ids(match({ status: 'NO_MATCH', score_breakdown: null }), { total_amount: LOW }, null)).toEqual([]);
  });

  it('gives every item an Indonesian label', () => {
    const items = requiredReviewItems(
      { ...partial(), anomaly_flag: true },
      { total_amount: HIGH },
      { fields: fields({ tax_amount: field(110, 'unverified') }) },
    );
    expect(items.map(({ label }) => label)).toEqual([
      'Skor nominal 11,11 dari 25: sudah diperiksa',
      'PPN belum terverifikasi: sudah diperiksa',
      'Anomali nominal: sudah diperiksa',
    ]);
    expect(requiredReviewItems(match(), { total_amount: HIGH }, { fields: fields() })[0].label).toBe(
      'Bukti Nomor invoice sesuai dokumen',
    );
  });
});
