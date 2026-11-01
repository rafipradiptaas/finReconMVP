import type { CheckedInvoice } from '@/lib/extraction-checks';
import type { ScoreBreakdown } from '@/lib/matching';
import type { MatchStatus, ReviewStatus } from '@/types/domain';

export type ReviewMatch = {
  status: MatchStatus;
  review_status: ReviewStatus;
  anomaly_flag: boolean;
  score_breakdown: ScoreBreakdown | null;
};

export type ReviewInvoice = { total_amount: number | null };
export type ReviewExtraction = { fields: CheckedInvoice } | null;
export type ReviewItem = { id: string; label: string };
