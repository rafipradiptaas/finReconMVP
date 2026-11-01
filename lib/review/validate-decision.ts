import { canTransitionReviewStatus } from '@/types/domain';
import { ANOMALY_REASON_MIN_CHARS } from './config';
import type { ReviewItem, ReviewMatch } from './types';

export type ReviewDecision = 'APPROVED' | 'REJECTED_BY_REVIEWER';

export type DecisionInput = {
  decision: ReviewDecision;
  itemsTicked: string[];
  reason: string | null;
  actorId: string;
  uploadedBy: string | null;
  match: ReviewMatch;
  requiredItems: ReviewItem[];
  /** Another invoice with the same vendor and number is already APPROVED or PAID. */
  duplicateDecided: boolean;
  /** The last matching run failed, so this match may not describe the invoice. */
  matchingFailed: boolean;
};

type Refusal = {
  ok: false;
  status: 400 | 403 | 409;
  code: string;
  message: string;
  details?: { missing: string[] };
};
export type DecisionResult = { ok: true; itemsTicked: string[] } | Refusal;

const refuse = (
  status: Refusal['status'],
  code: string,
  message: string,
  details?: Refusal['details'],
): Refusal => ({ ok: false, status, code, message, ...(details && { details }) });

/** Overrides are audited with the original status (product doc 7.5). */
export function isOverride(match: Pick<ReviewMatch, 'status' | 'anomaly_flag'>): boolean {
  return match.status !== 'FULL_MATCH' || match.anomaly_flag;
}

/** Why this actor cannot decide this match at all, whatever they would submit. */
export function reviewBlock({
  actorId,
  uploadedBy,
  match,
  matchingFailed,
}: Pick<DecisionInput, 'actorId' | 'uploadedBy' | 'match' | 'matchingFailed'>): Refusal | null {
  if (actorId === uploadedBy) {
    return refuse(403, 'UPLOADER_CANNOT_REVIEW', 'Pengunggah dokumen tidak boleh memutuskan match ini.');
  }
  if (!canTransitionReviewStatus(match.review_status, 'APPROVED')) {
    return refuse(409, 'INVALID_TRANSITION', 'Match ini sudah diputuskan.');
  }
  if (match.status === 'REJECTED') {
    return refuse(409, 'VETO_NOT_REVIEWABLE', 'Match yang kena veto tidak bisa direview. Tulis catatan investigasi.');
  }
  if (matchingFailed) {
    return refuse(409, 'MATCHING_FAILED', 'Matching terakhir gagal. Jalankan ulang lebih dulu.');
  }
  return null;
}

/** The only rule for review decisions. The API enforces it; the panel mirrors it. */
export function validateDecision(input: DecisionInput): DecisionResult {
  const blocked = reviewBlock(input);
  if (blocked) return blocked;

  const { decision, itemsTicked, reason, match, requiredItems, duplicateDecided } = input;
  const text = reason?.trim() ?? '';
  if (decision === 'REJECTED_BY_REVIEWER') {
    return text
      ? { ok: true, itemsTicked: [] }
      : refuse(400, 'REASON_REQUIRED', 'Alasan penolakan wajib diisi.');
  }

  // A veto cannot be overridden, and this is the duplicate veto's own condition.
  if (duplicateDecided) {
    return refuse(409, 'DUPLICATE_DECIDED', 'Invoice yang sama sudah disetujui atau dibayar. Tolak invoice ini.');
  }

  const ticked = new Set(itemsTicked);
  const missing = requiredItems.filter(({ id }) => !ticked.has(id)).map(({ id }) => id);
  if (missing.length > 0) {
    return refuse(400, 'ITEMS_REQUIRED', 'Centang semua item wajib.', { missing });
  }
  if (match.anomaly_flag && text.length < ANOMALY_REASON_MIN_CHARS) {
    return refuse(400, 'REASON_TOO_SHORT', `Alasan minimal ${ANOMALY_REASON_MIN_CHARS} karakter untuk anomali.`);
  }
  if (match.status !== 'FULL_MATCH' && !text) {
    return refuse(400, 'REASON_REQUIRED', 'Alasan wajib diisi.');
  }
  return { ok: true, itemsTicked: requiredItems.map(({ id }) => id) };
}
