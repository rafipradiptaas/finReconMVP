import { describe, expect, it } from 'vitest';
import * as config from '@/lib/matching/config';
import { findPurchaseOrder, scoreInvoice } from '@/lib/matching/scoring';
import type { MatchInvoice, MatchPurchaseOrder } from '@/lib/matching/types';
import { invoice, purchaseOrder, vendor } from './helpers';

const score = (over: Partial<MatchInvoice> = {}, po: MatchPurchaseOrder | null = purchaseOrder()) =>
  scoreInvoice(invoice(over), vendor(), po);

const withSubtotal = (subtotal: number) => ({ subtotal, tax_amount: null, total_amount: subtotal });

describe('weights', () => {
  it('sum to 100', () => {
    const { PO_WEIGHT, VENDOR_NAME_WEIGHT, AMOUNT_WEIGHT, LINE_ITEMS_WEIGHT, CONSISTENCY_ITEM_WEIGHT } = config;
    expect(PO_WEIGHT).toBe(25);
    expect(VENDOR_NAME_WEIGHT).toBe(15);
    expect(AMOUNT_WEIGHT).toBe(25);
    expect(LINE_ITEMS_WEIGHT).toBe(20);
    expect(CONSISTENCY_ITEM_WEIGHT).toBe(5);
    expect(
      PO_WEIGHT + VENDOR_NAME_WEIGHT + AMOUNT_WEIGHT + LINE_ITEMS_WEIGHT + 3 * CONSISTENCY_ITEM_WEIGHT,
    ).toBe(100);
  });

  it('a perfect invoice scores 100, with each component at its maximum', () => {
    const { score: total, breakdown } = score();
    expect(total).toBe(100);
    expect(breakdown).toEqual({
      po_number: { value: 25, max: 25 },
      vendor_name: { value: 15, max: 15 },
      amount: { value: 25, max: 25 },
      line_items: { value: 20, max: 20 },
      consistency: { value: 15, max: 15, lines_sum: 5, tax: 5, date: 5 },
    });
  });
});

describe('findPurchaseOrder', () => {
  const pos = [purchaseOrder()];

  it('finds the vendor\'s PO after normalization', () => {
    expect(findPurchaseOrder(invoice({ po_number: 'po 2026 001' }), vendor(), pos)?.id).toBe('po1');
  });

  it('a PO of another vendor counts as not found', () => {
    const other = [purchaseOrder({ vendor_id: 'v2' })];
    expect(findPurchaseOrder(invoice(), vendor(), other)).toBeNull();
  });

  it('a missing or unknown PO is not found', () => {
    expect(findPurchaseOrder(invoice({ po_number: null }), vendor(), pos)).toBeNull();
    expect(findPurchaseOrder(invoice({ po_number: 'PO-9' }), vendor(), pos)).toBeNull();
  });
});

describe('po_number component', () => {
  it('is 0 with no PO, and everything that needs the PO is 0 too', () => {
    const { breakdown } = score({}, null);
    expect(breakdown.po_number.value).toBe(0);
    expect(breakdown.amount.value).toBe(0);
    expect(breakdown.line_items.value).toBe(0);
    expect(breakdown.consistency.date).toBe(0);
  });

  it('keeps the checks that do not need a PO', () => {
    const { breakdown } = score({}, null);
    expect(breakdown.vendor_name.value).toBe(15);
    expect(breakdown.consistency.lines_sum).toBe(5);
    expect(breakdown.consistency.tax).toBe(5);
  });
});

describe('vendor_name component', () => {
  it('is similarity × 15', () => {
    const { breakdown } = score({ vendor_name: 'PT Sinar Logistik Nusantara Abadi' });
    expect(breakdown.vendor_name.value).toBeCloseTo(0.9636 * 15, 1);
  });

  it('ignores case and punctuation', () => {
    expect(score({ vendor_name: 'PT. SINAR LOGISTIK NUSANTARA' }).breakdown.vendor_name.value).toBe(15);
  });

  it('is 0 with no name', () => {
    expect(score({ vendor_name: null }).breakdown.vendor_name.value).toBe(0);
  });
});

describe('amount component: subtotal vs PO total', () => {
  it.each([
    ['exact', 15000000, 25],
    ['0.5% over → full', 15075000, 25],
    ['0.5% under → full', 14925000, 25],
    ['3% → 11.11', 15450000, 11.11],
    ['5% → 0', 15750000, 0],
    ['over 5% → 0', 18000000, 0],
  ])('%s', (_, subtotal, expected) => {
    expect(score(withSubtotal(subtotal)).breakdown.amount.value).toBeCloseTo(expected, 2);
  });

  it('just past 0.5% starts to fall', () => {
    const value = score(withSubtotal(15075150)).breakdown.amount.value;
    expect(value).toBeLessThan(25);
    expect(value).toBeGreaterThan(24.9);
  });

  it('uses subtotal, not total_amount', () => {
    expect(score({ subtotal: 15000000, total_amount: 99999999 }).breakdown.amount.value).toBe(25);
  });

  it('is 0 with no subtotal', () => {
    expect(score({ subtotal: null }).breakdown.amount.value).toBe(0);
  });

  it('survives a PO with a zero total', () => {
    const empty = purchaseOrder({ total_amount: 0 });
    expect(score({}, empty).breakdown.amount.value).toBe(0);
    expect(score(withSubtotal(0), empty).breakdown.amount.value).toBe(25);
  });
});

describe('line_items component', () => {
  const lines = invoice().line_items;

  it('scores matched lines over invoice lines', () => {
    const partial = [lines[0], { ...lines[1], description: 'Sesuatu yang lain sama sekali' }];
    expect(score({ line_items: partial }).breakdown.line_items.value).toBe(10);
  });

  it('needs the same quantity', () => {
    const changed = [{ ...lines[0], quantity: 9 }, lines[1]];
    expect(score({ line_items: changed }).breakdown.line_items.value).toBe(10);
  });

  it('accepts a unit price within 0.5% and refuses one past it', () => {
    const within = [{ ...lines[0], unit_price: 1005000 }, lines[1]];
    expect(score({ line_items: within }).breakdown.line_items.value).toBe(20);
    const past = [{ ...lines[0], unit_price: 1005001 }, lines[1]];
    expect(score({ line_items: past }).breakdown.line_items.value).toBe(10);
  });

  it('accepts a description similarity of 0.8', () => {
    const close = [{ ...lines[0], description: 'Jasa pengirimn' }, lines[1]];
    expect(score({ line_items: close }).breakdown.line_items.value).toBe(20);
  });

  it('ignores case in descriptions', () => {
    const upper = [{ ...lines[0], description: 'JASA PENGIRIMAN' }, lines[1]];
    expect(score({ line_items: upper }).breakdown.line_items.value).toBe(20);
  });

  it('one PO line cannot match two invoice lines', () => {
    const twice = [lines[0], lines[0]];
    expect(score({ line_items: twice }).breakdown.line_items.value).toBe(10);
  });

  it('no line items → 0, and the lines-sum point is 0 too', () => {
    const { breakdown } = score({ line_items: [] });
    expect(breakdown.line_items.value).toBe(0);
    expect(breakdown.consistency.lines_sum).toBe(0);
  });
});

describe('consistency component', () => {
  it('lines sum: within 0.5% of subtotal, boundary included', () => {
    const lines = [{ description: 'x', quantity: 1, unit_price: 1, line_subtotal: 1005 }];
    expect(score({ subtotal: 1000, line_items: lines }).breakdown.consistency.lines_sum).toBe(5);
    const past = [{ ...lines[0], line_subtotal: 1005.01 }];
    expect(score({ subtotal: 1000, line_items: past }).breakdown.consistency.lines_sum).toBe(0);
  });

  it('tax: subtotal + tax = total within Rp 1, boundary included', () => {
    const base = { subtotal: 1000, tax_amount: 110 };
    expect(score({ ...base, total_amount: 1111 }).breakdown.consistency.tax).toBe(5);
    expect(score({ ...base, total_amount: 1109 }).breakdown.consistency.tax).toBe(5);
    expect(score({ ...base, total_amount: 1111.01 }).breakdown.consistency.tax).toBe(0);
  });

  it('non-PKP: null tax with subtotal = total gets the tax point', () => {
    const lines = { subtotal: 3900000, tax_amount: null, total_amount: 3900000 };
    expect(score(lines).breakdown.consistency.tax).toBe(5);
  });

  it('a missing amount loses the tax point', () => {
    expect(score({ total_amount: null }).breakdown.consistency.tax).toBe(0);
    expect(score({ subtotal: null }).breakdown.consistency.tax).toBe(0);
  });

  it('date: invoice on or after the PO date', () => {
    expect(score({ invoice_date: '2026-07-01' }).breakdown.consistency.date).toBe(5);
    expect(score({ invoice_date: '2026-06-30' }).breakdown.consistency.date).toBe(0);
  });

  it('a missing date loses the date point', () => {
    expect(score({ invoice_date: null }).breakdown.consistency.date).toBe(0);
  });

  it('adds up in value', () => {
    const { breakdown } = score({ invoice_date: '2026-06-30' });
    expect(breakdown.consistency.value).toBe(10);
  });
});

describe('total', () => {
  it('is rounded to 2 decimals, as stored', () => {
    const { score: total } = score({ vendor_name: 'PT Sinar Logistik Nusantara Abadi' });
    expect(total).toBe(Math.round(total * 100) / 100);
  });
});
