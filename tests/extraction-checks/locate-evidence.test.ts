import { describe, expect, it } from 'vitest';
import { locateEvidence } from '@/lib/extraction-checks/locate-evidence';
import type { TextItem } from '@/lib/extraction-checks/types';

const item = (page: number, str: string, x: number, y: number): TextItem => ({
  page,
  str,
  bbox: { x, y, width: 50, height: 10 },
});

const ITEMS = [
  item(1, 'Nomor Invoice', 10, 10),
  item(1, ': INV-001', 80, 10),
  item(1, 'Subtotal', 10, 30),
  item(1, 'Rp 24.000.000', 80, 30),
  item(2, 'Bank BCA No. Rek. 1234567890', 10, 10),
];

describe('locateEvidence', () => {
  it('finds a snippet inside one item', () => {
    expect(locateEvidence('INV-001', ITEMS)).toEqual([{ page: 1, bbox: ITEMS[1].bbox }]);
  });

  it('returns the page of the item', () => {
    expect(locateEvidence('1234567890', ITEMS)).toEqual([{ page: 2, bbox: ITEMS[4].bbox }]);
  });

  it('finds a snippet spanning neighbouring items', () => {
    expect(locateEvidence('Subtotal Rp 24.000.000', ITEMS)).toEqual([
      { page: 1, bbox: ITEMS[2].bbox },
      { page: 1, bbox: ITEMS[3].bbox },
    ]);
  });

  it('ignores case and whitespace differences', () => {
    expect(locateEvidence('rp  24.000.000', ITEMS)).toEqual([{ page: 1, bbox: ITEMS[3].bbox }]);
  });

  it('returns every occurrence', () => {
    const items = [item(1, 'BCA', 0, 0), item(2, 'BCA', 0, 0)];
    expect(locateEvidence('BCA', items)).toHaveLength(2);
  });

  it('returns [] when the snippet is absent, empty or null', () => {
    expect(locateEvidence('INV-999', ITEMS)).toEqual([]);
    expect(locateEvidence('', ITEMS)).toEqual([]);
    expect(locateEvidence(null, ITEMS)).toEqual([]);
  });
});
