import { describe, expect, it } from 'vitest';
import { classify } from '@/lib/matching/classify';

describe('classify', () => {
  it.each([
    [100, 'FULL_MATCH'],
    [90, 'FULL_MATCH'],
    [89.99, 'PARTIAL_MATCH'],
    [60, 'PARTIAL_MATCH'],
    [59.99, 'NO_MATCH'],
    [0, 'NO_MATCH'],
  ])('score %d → %s', (score, status) => {
    expect(classify(score, true)).toBe(status);
  });

  it.each([100, 90, 60, 0])('PO not found → NO_MATCH, even at %d', (score) => {
    expect(classify(score, false)).toBe('NO_MATCH');
  });
});
