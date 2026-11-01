import { describe, expect, it } from 'vitest';
import { correctionLock } from '@/lib/review';
import { MATCH_STATUSES, REVIEW_STATUSES } from '@/types/domain';

describe('correctionLock (D25)', () => {
  it('is open while there is no match', () => {
    expect(correctionLock(null)).toBeNull();
    expect(correctionLock(undefined)).toBeNull();
  });

  it.each(['FULL_MATCH', 'PARTIAL_MATCH', 'NO_MATCH'] as const)('is open on a pending %s', (status) => {
    expect(correctionLock({ status, review_status: 'PENDING_REVIEW' })).toBeNull();
  });

  it.each(REVIEW_STATUSES)('locks a veto at %s', (review_status) => {
    expect(correctionLock({ status: 'REJECTED', review_status })?.code).toBe('VETO_LOCKED');
  });

  it('locks every decided match', () => {
    for (const status of MATCH_STATUSES.filter((value) => value !== 'REJECTED')) {
      for (const review_status of ['APPROVED', 'PAID', 'REJECTED_BY_REVIEWER'] as const) {
        expect(correctionLock({ status, review_status })?.code).toBe('DECISION_LOCKED');
      }
    }
  });
});
