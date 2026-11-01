import { FULL_MATCH_MIN, PARTIAL_MATCH_MIN } from './config';
import type { MatchStatus } from '@/types/domain';

/** REJECTED comes from a veto and never reaches this function. */
export function classify(score: number, poFound: boolean): Exclude<MatchStatus, 'REJECTED'> {
  if (!poFound) return 'NO_MATCH';
  if (score >= FULL_MATCH_MIN) return 'FULL_MATCH';
  return score >= PARTIAL_MATCH_MIN ? 'PARTIAL_MATCH' : 'NO_MATCH';
}
