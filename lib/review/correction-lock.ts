import type { MatchStatus, ReviewStatus } from '@/types/domain';

type Lock = { code: 'VETO_LOCKED' | 'DECISION_LOCKED'; message: string };

/**
 * Corrections are open only until a match is decided, and never on a veto: a
 * typed value must not be able to clear one (D25). The path out of a veto is an
 * investigation note and a new document.
 */
export function correctionLock(
  match: { status: MatchStatus; review_status: ReviewStatus } | null | undefined,
): Lock | null {
  if (!match) return null;
  if (match.status === 'REJECTED') {
    return {
      code: 'VETO_LOCKED',
      message: 'Match kena veto, jadi field tidak bisa dikoreksi. Tulis catatan investigasi dan unggah dokumen baru.',
    };
  }
  if (match.review_status !== 'PENDING_REVIEW') {
    return { code: 'DECISION_LOCKED', message: 'Invoice ini sudah diputuskan dan tidak bisa dikoreksi.' };
  }
  return null;
}
