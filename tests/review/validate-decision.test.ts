import { describe, expect, it } from 'vitest';
import { ANOMALY_REASON_MIN_CHARS, isOverride, validateDecision, type DecisionInput } from '@/lib/review';
import { REVIEW_STATUSES } from '@/types/domain';
import { match } from './helpers';

const REVIEWER = 'reviewer';
const UPLOADER = 'uploader';
const item = (id: string) => ({ id, label: id });

const input = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  decision: 'APPROVED',
  itemsTicked: [],
  reason: null,
  actorId: REVIEWER,
  uploadedBy: UPLOADER,
  match: match(),
  requiredItems: [],
  duplicateDecided: false,
  matchingFailed: false,
  ...over,
});

const error = (over: Partial<DecisionInput>) => {
  const result = validateDecision(input(over));
  if (result.ok) throw new Error('expected a refusal');
  return { status: result.status, code: result.code };
};

describe('validateDecision', () => {
  it('keeps the anomaly reason at 20 characters', () => {
    expect(ANOMALY_REASON_MIN_CHARS).toBe(20);
  });

  it('approves a one-click FULL_MATCH', () => {
    expect(validateDecision(input())).toEqual({ ok: true, itemsTicked: [] });
  });

  it('stores only the ticks that were required', () => {
    const result = validateDecision(
      input({ requiredItems: [item('a')], itemsTicked: ['a', 'made-up', 'a'] }),
    );
    expect(result).toEqual({ ok: true, itemsTicked: ['a'] });
  });

  describe('separation of duties (D7)', () => {
    it.each(['APPROVED', 'REJECTED_BY_REVIEWER'] as const)('refuses the uploader: %s', (decision) => {
      expect(error({ decision, reason: 'alasan cukup panjang sekali', actorId: UPLOADER })).toEqual({
        status: 403,
        code: 'UPLOADER_CANNOT_REVIEW',
      });
    });

    it('wins over every other problem', () => {
      expect(
        error({ actorId: UPLOADER, match: match({ status: 'REJECTED', review_status: 'PAID' }) }).status,
      ).toBe(403);
    });
  });

  describe('transitions', () => {
    it.each(REVIEW_STATUSES.filter((status) => status !== 'PENDING_REVIEW'))(
      'refuses a decision on %s',
      (review_status) => {
        for (const decision of ['APPROVED', 'REJECTED_BY_REVIEWER'] as const) {
          expect(error({ decision, reason: 'alasan', match: match({ review_status }) })).toEqual({
            status: 409,
            code: 'INVALID_TRANSITION',
          });
        }
      },
    );
  });

  describe('veto', () => {
    it.each(['APPROVED', 'REJECTED_BY_REVIEWER'] as const)('REJECTED has no review path: %s', (decision) => {
      expect(
        error({ decision, reason: 'alasan cukup panjang sekali', match: match({ status: 'REJECTED' }) }),
      ).toEqual({ status: 409, code: 'VETO_NOT_REVIEWABLE' });
    });
  });

  describe('a stale match', () => {
    it.each(['APPROVED', 'REJECTED_BY_REVIEWER'] as const)('refuses while matching has failed: %s', (decision) => {
      expect(error({ decision, reason: 'alasan', matchingFailed: true })).toEqual({
        status: 409,
        code: 'MATCHING_FAILED',
      });
    });
  });

  describe('reject', () => {
    it.each([null, '', '   '])('needs a reason: %j', (reason) => {
      expect(error({ decision: 'REJECTED_BY_REVIEWER', reason })).toEqual({
        status: 400,
        code: 'REASON_REQUIRED',
      });
    });

    it('needs no ticks, and stores none', () => {
      expect(
        validateDecision(
          input({
            decision: 'REJECTED_BY_REVIEWER',
            reason: 'tidak sesuai',
            requiredItems: [item('a')],
            itemsTicked: ['a'],
          }),
        ),
      ).toEqual({ ok: true, itemsTicked: [] });
    });

    it('is allowed with a decided twin', () => {
      expect(
        validateDecision(input({ decision: 'REJECTED_BY_REVIEWER', reason: 'duplikat', duplicateDecided: true })).ok,
      ).toBe(true);
    });
  });

  describe('approve', () => {
    const partial = { match: match({ status: 'PARTIAL_MATCH' }), requiredItems: [item('a'), item('b')] };

    it('refuses when a twin is already approved or paid', () => {
      expect(error({ duplicateDecided: true })).toEqual({ status: 409, code: 'DUPLICATE_DECIDED' });
    });

    it('refuses a missing tick, and names it', () => {
      const result = validateDecision(input({ ...partial, itemsTicked: ['a'], reason: 'alasan' }));
      expect(result).toEqual({
        ok: false,
        status: 400,
        code: 'ITEMS_REQUIRED',
        message: expect.any(String),
        details: { missing: ['b'] },
      });
    });

    it.each(['PARTIAL_MATCH', 'NO_MATCH'] as const)('%s needs a reason', (status) => {
      const flagged = { match: match({ status }), requiredItems: [item('a')], itemsTicked: ['a'] };
      expect(error({ ...flagged, reason: ' ' })).toEqual({ status: 400, code: 'REASON_REQUIRED' });
      expect(validateDecision(input({ ...flagged, reason: 'x' })).ok).toBe(true);
    });

    it('an anomaly needs at least 20 characters after trimming', () => {
      const flagged = { match: match({ anomaly_flag: true }), requiredItems: [item('anomaly')], itemsTicked: ['anomaly'] };
      expect(error({ ...flagged, reason: `  ${'a'.repeat(19)}  ` })).toEqual({
        status: 400,
        code: 'REASON_TOO_SHORT',
      });
      expect(error({ ...flagged, reason: null })).toEqual({ status: 400, code: 'REASON_TOO_SHORT' });
      expect(validateDecision(input({ ...flagged, reason: 'a'.repeat(20) })).ok).toBe(true);
    });

    it('a high-amount FULL_MATCH needs ticks but no reason', () => {
      expect(validateDecision(input({ requiredItems: [item('a')], itemsTicked: ['a'] })).ok).toBe(true);
      expect(error({ requiredItems: [item('a')] }).code).toBe('ITEMS_REQUIRED');
    });
  });
});

describe('isOverride (product doc 7.5)', () => {
  it('is an approval of anything but a clean FULL_MATCH', () => {
    expect(isOverride(match())).toBe(false);
    expect(isOverride(match({ anomaly_flag: true }))).toBe(true);
    expect(isOverride(match({ status: 'PARTIAL_MATCH' }))).toBe(true);
    expect(isOverride(match({ status: 'NO_MATCH' }))).toBe(true);
  });
});
