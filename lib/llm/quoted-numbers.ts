/** Digit runs with separators removed, so 15.750.000 and 15750000 compare equal. */
const numbersIn = (text: string) =>
  (text.match(/\d(?:[\d.,]*\d)?/g) ?? []).map((run) => run.replace(/[.,]00$/, '').replace(/\D/g, ''));

/**
 * A coarse guard on LLM-written text: every number in it must appear inside a
 * number in the source. It catches a number made up, not one misattributed.
 */
export function quotesOnlySource(text: string, source: string): boolean {
  const given = numbersIn(source);
  return numbersIn(text).every((number) => given.some((value) => value.includes(number)));
}
