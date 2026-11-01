export { ANOMALY_REASON_MIN_CHARS, REVIEW_HIGH_AMOUNT } from './config';
export { buildComparisons, type Comparison } from './comparisons';
export { correctionLock } from './correction-lock';
export { requiredReviewItems } from './required-items';
export type { ReviewExtraction, ReviewInvoice, ReviewItem, ReviewMatch } from './types';
export {
  isOverride,
  reviewBlock,
  validateDecision,
  type DecisionInput,
  type DecisionResult,
  type ReviewDecision,
} from './validate-decision';
