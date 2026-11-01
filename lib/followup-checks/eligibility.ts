import type { MatchStatus, VetoCode } from '@/types/domain';

type Match = { status: MatchStatus; anomaly_flag: boolean; veto_code: VetoCode | null };

/** Product doc 10.1. A bank mismatch gets a call-back to the known contact, not an approve path. */
export function isFollowupEligible({ status, anomaly_flag, veto_code }: Match): boolean {
  if (status === 'REJECTED') return veto_code === 'VETO_BANK_MISMATCH';
  return status === 'PARTIAL_MATCH' || status === 'NO_MATCH' || anomaly_flag;
}
