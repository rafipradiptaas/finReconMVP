import { describe, expect, it } from 'vitest';
import { checkAnomaly } from '@/lib/matching/anomaly';
import type { HistoryEntry } from '@/lib/matching/types';
import { paid } from './helpers';

const NOW = new Date('2026-10-31T00:00:00Z');
const six = (over: Partial<HistoryEntry> = {}) =>
  Array.from({ length: 6 }, (_, i) => paid({ invoice_id: `h${i}`, total_amount: 10000000, ...over }));

const check = (total: number | null, history: HistoryEntry[]) => checkAnomaly(total, 'v1', history, NOW);

describe('with at least 6 PAID invoices in 24 months', () => {
  it('flags a total over 3 × the mean', () => {
    const result = check(30000001, six());
    expect(result.anomalyFlag).toBe(true);
  });

  it('does not flag exactly 3 × the mean', () => {
    expect(check(30000000, six()).anomalyFlag).toBe(false);
  });

  it('the reason carries the mean, the count and the ratio', () => {
    const { anomalyReason } = check(80000000, six());
    expect(anomalyReason).toContain('10.000.000');
    expect(anomalyReason).toContain('6');
    expect(anomalyReason).toContain('8,0');
  });

  it('ignores the absolute threshold', () => {
    const big = six({ total_amount: 400000000 });
    expect(check(600000000, big).anomalyFlag).toBe(false);
  });
});

describe('with fewer than 6', () => {
  const five = six().slice(0, 5);

  it('uses the absolute threshold', () => {
    expect(check(500000001, five).anomalyFlag).toBe(true);
    expect(check(500000000, five).anomalyFlag).toBe(false);
  });

  it('does not use the mean', () => {
    expect(check(90000000, five).anomalyFlag).toBe(false);
  });

  it('the reason states the threshold', () => {
    expect(check(600000000, five).anomalyReason).toContain('500.000.000');
  });
});

describe('what counts as history', () => {
  it('ignores anything older than 24 months', () => {
    const old = six({ paid_at: '2024-10-30' });
    expect(check(90000000, old).anomalyFlag).toBe(false);
  });

  it('includes a payment exactly 24 months old', () => {
    const edge = six({ paid_at: '2024-10-31' });
    expect(check(90000000, edge).anomalyFlag).toBe(true);
  });

  it('counts only PAID', () => {
    const approved = six({ review_status: 'APPROVED' });
    expect(check(90000000, approved).anomalyFlag).toBe(false);
  });

  it('counts only this vendor', () => {
    const other = six({ vendor_id: 'v2' });
    expect(check(90000000, other).anomalyFlag).toBe(false);
  });

  it('ignores a PAID entry with no paid date or amount', () => {
    const incomplete = [
      ...six().slice(0, 5),
      paid({ invoice_id: 'x', paid_at: null }),
      paid({ invoice_id: 'y', total_amount: null }),
    ];
    expect(check(90000000, incomplete).anomalyFlag).toBe(false);
  });

  it('no total, no flag', () => {
    expect(check(null, six())).toEqual({ anomalyFlag: false });
  });

  it('a clean result carries no reason', () => {
    expect(check(1000, six())).toEqual({ anomalyFlag: false });
  });
});
