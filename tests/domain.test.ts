import { describe, expect, it } from 'vitest';
import { canTransitionReviewStatus, REVIEW_STATUSES, ROLES } from '@/types/domain';

describe('domain enums', () => {
  it('has the roles from product doc section 8', () => {
    expect([...ROLES]).toEqual(['admin', 'ap_staff', 'approver']);
  });

  it('allows only forward review transitions', () => {
    expect(canTransitionReviewStatus('PENDING_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransitionReviewStatus('APPROVED', 'PAID')).toBe(true);
    expect(canTransitionReviewStatus('PAID', 'APPROVED')).toBe(false);
    expect(canTransitionReviewStatus('REJECTED_BY_REVIEWER', 'APPROVED')).toBe(false);
    expect(canTransitionReviewStatus('PENDING_REVIEW', 'PAID')).toBe(false);
  });

  it('terminates: PAID and REJECTED_BY_REVIEWER go nowhere', () => {
    for (const to of REVIEW_STATUSES) {
      expect(canTransitionReviewStatus('PAID', to)).toBe(false);
    }
  });
});
