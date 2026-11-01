import { describe, expect, it } from 'vitest';
import { isFollowupEligible } from '@/lib/followup-checks';

const match = (status: string, anomaly_flag = false, veto_code: string | null = null) =>
  ({ status, anomaly_flag, veto_code }) as Parameters<typeof isFollowupEligible>[0];

describe('isFollowupEligible (product doc 10.1)', () => {
  it('takes PARTIAL_MATCH, NO_MATCH and anomalies', () => {
    expect(isFollowupEligible(match('PARTIAL_MATCH'))).toBe(true);
    expect(isFollowupEligible(match('NO_MATCH'))).toBe(true);
    expect(isFollowupEligible(match('FULL_MATCH', true))).toBe(true);
  });

  it('takes a veto only for a bank mismatch', () => {
    expect(isFollowupEligible(match('REJECTED', false, 'VETO_BANK_MISMATCH'))).toBe(true);
    for (const code of ['VETO_VENDOR_NOT_FOUND', 'VETO_VENDOR_NOT_VERIFIED', 'VETO_DUPLICATE_INVOICE']) {
      expect(isFollowupEligible(match('REJECTED', false, code))).toBe(false);
    }
  });

  it('refuses a clean FULL_MATCH', () => {
    expect(isFollowupEligible(match('FULL_MATCH'))).toBe(false);
  });
});
