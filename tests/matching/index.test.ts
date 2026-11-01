import { describe, expect, it } from 'vitest';
import { pendingDuplicateInvoices, runMatching } from '@/lib/matching';
import type { HistoryEntry } from '@/lib/matching/types';
import { invoice, paid, purchaseOrder, vendor } from './helpers';

const NOW = new Date('2026-10-31T00:00:00Z');
const context = (over = {}) => ({
  vendors: [vendor()],
  purchaseOrders: [purchaseOrder()],
  history: [] as HistoryEntry[],
  now: NOW,
  ...over,
});

const manyPaid = Array.from({ length: 6 }, (_, i) => paid({ invoice_id: `h${i}`, total_amount: 1000000 }));

describe('pendingDuplicateInvoices', () => {
  const row = (invoice_id: string, over = {}) => ({
    invoice_id,
    vendor_id: 'v1',
    invoice_number_normalized: 'INV001',
    review_status: 'PENDING_REVIEW' as const,
    ...over,
  });

  it('marks both pending twins', () => {
    expect(pendingDuplicateInvoices([row('a'), row('b')])).toEqual(new Set(['a', 'b']));
  });

  it('does not mark a pending invoice whose twin is already decided', () => {
    const rows = [row('a'), row('b', { review_status: 'REJECTED_BY_REVIEWER' })];
    expect(pendingDuplicateInvoices(rows).has('a')).toBe(false);
  });

  it('marks a decided invoice whose twin is still pending', () => {
    const rows = [row('a', { review_status: 'APPROVED' }), row('b')];
    expect(pendingDuplicateInvoices(rows)).toEqual(new Set(['a']));
  });

  it('needs the same vendor and number', () => {
    expect(pendingDuplicateInvoices([row('a'), row('b', { vendor_id: 'v2' })])).toEqual(new Set());
    const rows = [row('a'), row('b', { invoice_number_normalized: 'INV002' })];
    expect(pendingDuplicateInvoices(rows)).toEqual(new Set());
  });

  it('ignores invoices with no vendor or no number', () => {
    const rows = [row('a', { vendor_id: null }), row('b', { vendor_id: null })];
    expect(pendingDuplicateInvoices(rows)).toEqual(new Set());
    const unnumbered = [row('a', { invoice_number_normalized: null }), row('b', { invoice_number_normalized: null })];
    expect(pendingDuplicateInvoices(unnumbered)).toEqual(new Set());
  });
});

describe('runMatching', () => {
  it('a clean invoice is a FULL_MATCH', () => {
    expect(runMatching(invoice(), context())).toMatchObject({
      status: 'FULL_MATCH',
      vetoCode: null,
      score: 100,
      anomalyFlag: false,
      pendingDuplicateWarning: false,
      vendorId: 'v1',
      poId: 'po1',
    });
  });

  it('the worked example in product doc 7.2 yields 66.11 PARTIAL_MATCH', () => {
    const result = runMatching(
      invoice({
        subtotal: 15450000,
        tax_amount: 1699500,
        total_amount: 17149500,
        line_items: [
          { description: 'Jasa pengiriman', quantity: 10, unit_price: 1030000, line_subtotal: 10300000 },
          { description: 'Asuransi kargo', quantity: 10, unit_price: 515000, line_subtotal: 5150000 },
        ],
      }),
      context(),
    );
    expect(result.status).toBe('PARTIAL_MATCH');
    expect(result.score).toBe(66.11);
    expect(result.scoreBreakdown).toMatchObject({
      po_number: { value: 25 },
      vendor_name: { value: 15 },
      line_items: { value: 0 },
      consistency: { value: 15 },
    });
  });

  it('a veto stops everything: no score, no breakdown, no anomaly', () => {
    const result = runMatching(
      invoice({ bank_account_number: '9999999999', total_amount: 9000000000 }),
      context(),
    );
    expect(result).toMatchObject({
      status: 'REJECTED',
      vetoCode: 'VETO_BANK_MISMATCH',
      score: null,
      scoreBreakdown: null,
      anomalyFlag: false,
      vendorId: 'v1',
    });
    expect(result.anomalyReason).toBeUndefined();
  });

  it('an unknown vendor has no vendor id', () => {
    const result = runMatching(invoice({ npwp: '1', vendor_name: 'Vendor Palsu' }), context());
    expect(result).toMatchObject({ status: 'REJECTED', vetoCode: 'VETO_VENDOR_NOT_FOUND', vendorId: null, poId: null });
  });

  it('a rejected invoice still names its PO, for the review panel', () => {
    const result = runMatching(invoice({ bank_account_number: '9' }), context());
    expect(result.poId).toBe('po1');
  });

  it('an unknown PO is NO_MATCH, with a score but no PO', () => {
    const result = runMatching(invoice({ po_number: 'PO-X' }), context());
    expect(result).toMatchObject({ status: 'NO_MATCH', poId: null, vetoCode: null });
    expect(result.score).toBe(15 + 5 + 5);
  });

  it('a PO of another vendor is NO_MATCH', () => {
    const pos = [purchaseOrder({ vendor_id: 'v2' })];
    expect(runMatching(invoice(), context({ purchaseOrders: pos }))).toMatchObject({
      status: 'NO_MATCH',
      poId: null,
    });
  });

  it('anomaly attaches to any non-rejected status', () => {
    const result = runMatching(invoice(), context({ history: manyPaid }));
    expect(result).toMatchObject({ status: 'FULL_MATCH', anomalyFlag: true });
    expect(result.anomalyReason).toBeTruthy();

    const noMatch = runMatching(invoice({ po_number: 'PO-X' }), context({ history: manyPaid }));
    expect(noMatch).toMatchObject({ status: 'NO_MATCH', anomalyFlag: true });
  });

  it('REJECTED is never flagged', () => {
    const result = runMatching(invoice({ bank_account_number: '9' }), context({ history: manyPaid }));
    expect(result.anomalyFlag).toBe(false);
  });

  it('a pending twin warns and the match goes on', () => {
    const twin = paid({ invoice_number_normalized: 'INV001', review_status: 'PENDING_REVIEW' });
    expect(runMatching(invoice(), context({ history: [twin] }))).toMatchObject({
      status: 'FULL_MATCH',
      pendingDuplicateWarning: true,
    });
  });

  it('runs in the fixed order: a veto outranks a perfect score', () => {
    const twin = paid({ invoice_number_normalized: 'INV001', review_status: 'APPROVED' });
    expect(runMatching(invoice(), context({ history: [twin] }))).toMatchObject({
      status: 'REJECTED',
      vetoCode: 'VETO_DUPLICATE_INVOICE',
      score: null,
    });
  });

  it('is deterministic', () => {
    const result = runMatching(invoice(), context({ history: manyPaid }));
    expect(runMatching(invoice(), context({ history: manyPaid }))).toEqual(result);
  });
});
