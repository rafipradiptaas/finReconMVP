import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { REFUSAL } from '@/lib/chatbot/config';
import { scoreAnswer, type ChatQuestion } from '../../scripts/chatbot-score';

const question = (over: Partial<ChatQuestion> = {}): ChatQuestion => ({
  id: 'q',
  trap: false,
  question: '?',
  expected: [],
  ...over,
});

describe('scoreAnswer', () => {
  it('finds an amount in any spacing', () => {
    const asked = question({ expected: ['Rp 1.234.500'] });
    expect(scoreAnswer(asked, 'Totalnya Rp 1.234.500.')).toBe('correct');
    expect(scoreAnswer(asked, 'Totalnya Rp1.234.500,-')).toBe('correct');
    expect(scoreAnswer(asked, 'Totalnya Rp 1.234.501.')).toBe('fabricated');
  });

  it('matches a count as a whole number', () => {
    const asked = question({ expected: ['2'] });
    expect(scoreAnswer(asked, 'Ada 2 invoice.')).toBe('correct');
    expect(scoreAnswer(asked, 'Ada 12 invoice.')).toBe('fabricated');
    expect(scoreAnswer(asked, 'Ada 2.000 invoice.')).toBe('fabricated');
  });

  it('accepts any of the listed words', () => {
    const asked = question({ any_of: ['PAID', 'dibayar'] });
    expect(scoreAnswer(asked, 'Invoice itu sudah dibayar.')).toBe('correct');
    expect(scoreAnswer(asked, 'Masih menunggu.')).toBe('fabricated');
  });

  it('counts the refusal as refused, on a trap or not', () => {
    expect(scoreAnswer(question({ trap: true }), REFUSAL)).toBe('refused');
    expect(scoreAnswer(question({ expected: ['Rp 1'] }), REFUSAL)).toBe('refused');
  });

  it('calls any other answer to a trap fabricated', () => {
    expect(scoreAnswer(question({ trap: true }), 'CEO-nya Budi.')).toBe('fabricated');
  });
});

describe('fixtures/chatbot-questions.json', () => {
  it('has 30 to 50 questions and 10 traps, each with an expectation', () => {
    const all = JSON.parse(readFileSync('fixtures/chatbot-questions.json', 'utf8')) as ChatQuestion[];
    const asked = all.filter(({ trap }) => !trap);
    expect(asked.length).toBeGreaterThanOrEqual(30);
    expect(asked.length).toBeLessThanOrEqual(50);
    expect(all.filter(({ trap }) => trap)).toHaveLength(10);
    expect(new Set(all.map(({ id }) => id)).size).toBe(all.length);
    for (const { expected, any_of } of asked) expect(expected.length + (any_of?.length ?? 0)).toBeGreaterThan(0);
  });
});
