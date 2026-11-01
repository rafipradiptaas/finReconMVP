import type { FieldConfidence, FieldVerification } from '@/types/domain';
import type { Signals } from './types';

/** verified iff every applicable signal passes and the model was not unsure (D5). */
export function fieldVerification(
  value: unknown,
  signals: Signals,
  confidence: FieldConfidence,
): FieldVerification {
  if (value === null || confidence === 'low') return 'unverified';
  return Object.values(signals).every((signal) => signal !== false) ? 'verified' : 'unverified';
}
