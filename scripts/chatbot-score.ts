import { REFUSAL } from '../lib/chatbot/config';

export type ChatQuestion = { id: string; trap: boolean; question: string; expected: string[]; any_of?: string[] };
export type ChatOutcome = 'correct' | 'refused' | 'fabricated';

const compact = (text: string) => text.toLowerCase().replace(/[\s.,]/g, '');

/** A digit-only expectation must stand alone: "2" is not in "12". */
function contains(answer: string, expected: string) {
  if (/^\d+$/.test(expected)) return new RegExp(`(?<![\\d.,])${expected}(?![\\d]|[.,]\\d)`).test(answer);
  return compact(answer).includes(compact(expected));
}

/** On a trap, refusing is the right answer, and anything else is fabrication (D12). */
export function scoreAnswer({ trap, expected, any_of }: ChatQuestion, answer: string): ChatOutcome {
  if (answer.includes(REFUSAL)) return 'refused';
  if (trap) return 'fabricated';
  const allPresent = expected.every((value) => contains(answer, value));
  const onePresent = !any_of || any_of.some((value) => contains(answer, value));
  return allPresent && onePresent ? 'correct' : 'fabricated';
}
