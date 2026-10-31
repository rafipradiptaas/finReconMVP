import {
  ACCOUNT_MAX_DIGITS,
  ACCOUNT_MIN_DIGITS,
  AMOUNT_TOLERANCE_RUPIAH,
  LINES_SUM_TOLERANCE,
  NPWP_DIGITS,
} from './config';
import { normalizeDate, normalizeDigits, normalizeMoney, normalizeText } from './normalize';
import type { LineItem } from './types';

// Money and quantities are compared in whole cents so floats cannot move a tolerance boundary.
const cents = (value: number) => Math.round(value * 100);
const withinRupiah = (a: number, b: number) =>
  Math.abs(cents(a) - cents(b)) <= AMOUNT_TOLERANCE_RUPIAH * 100;

const NUMBER_TOKEN = /\d[\d.,]*\d|\d/g;
// Scanned one at a time: as a single alternation, "PO-004  TANGGAL  2026-07-21"
// reads as day 04 of a month called TANGGAL and swallows the real date's year.
const DATE_TOKENS = [
  /\d{4}-\d{1,2}-\d{1,2}/g,
  /\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/g,
  /\d{1,2}\s+[A-Za-z]+\.?,?\s+\d{4}/g,
  /[A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}/g,
];

export function groundedMoney(value: number, text: string): boolean {
  return (text.match(NUMBER_TOKEN) ?? []).some((token) => {
    const parsed = normalizeMoney(token);
    return parsed !== null && cents(parsed) === cents(value);
  });
}

export function groundedDate(iso: string, text: string): boolean {
  return DATE_TOKENS.some((pattern) =>
    (text.match(pattern) ?? []).some((token) => normalizeDate(token) === iso),
  );
}

/**
 * The digits may be broken up by single separators, but never sit inside a
 * longer number, so a truncated account is not grounded by the full one. The
 * router joins separate items with two spaces, which ends a number here.
 */
export function groundedDigits(digits: string, text: string): boolean {
  if (!digits) return false;
  const separator = '[\\s.\\-]';
  const body = [...digits].join(`${separator}?`);
  return new RegExp(`(?<!\\d${separator}?)${body}(?!${separator}?\\d)`).test(text);
}

const isAlnum = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

/** Case-insensitive and whole-token, so INV-1 is not grounded by INV-12. */
export function groundedText(value: string, text: string): boolean {
  const needle = normalizeText(value).toUpperCase();
  const haystack = normalizeText(text).toUpperCase();
  if (!needle) return false;

  for (
    let at = haystack.indexOf(needle);
    at >= 0;
    at = haystack.indexOf(needle, at + 1)
  ) {
    const before = haystack[at - 1];
    const after = haystack[at + needle.length];
    if (!isAlnum(before) && !isAlnum(after)) return true;
  }
  return false;
}

/** A description may wrap across table rows, so each word is looked up on its own. */
export function groundedWords(value: string, text: string): boolean {
  const words = normalizeText(value).split(' ').filter(Boolean);
  return words.length > 0 && words.every((word) => groundedText(word, text));
}

const digitsOnly = (value: string) => /^[\d\s.\-]+$/.test(value);

/** null = no format rule for this field. */
export function formatOk(field: string, value: string | number): boolean | null {
  switch (field) {
    case 'npwp':
      return (
        digitsOnly(String(value)) && NPWP_DIGITS.includes(normalizeDigits(String(value)).length)
      );
    case 'bank_account_number': {
      const length = normalizeDigits(String(value)).length;
      return (
        digitsOnly(String(value)) && length >= ACCOUNT_MIN_DIGITS && length <= ACCOUNT_MAX_DIGITS
      );
    }
    case 'invoice_date':
      return normalizeDate(String(value)) !== null;
    case 'invoice_number':
      return String(value).trim().length > 0;
    case 'subtotal':
    case 'tax_amount':
    case 'total_amount':
      return Number(value) >= 0;
    default:
      return null;
  }
}

/** subtotal + tax = total within Rp 1. No tax (non-PKP) means subtotal = total. */
export function amountsConsistent(
  subtotal: number | null,
  tax: number | null,
  total: number | null,
): boolean {
  if (subtotal === null || total === null) return false;
  return withinRupiah(subtotal + (tax ?? 0), total);
}

export function lineArithmeticOk(
  line: Pick<LineItem, 'quantity' | 'unit_price' | 'line_subtotal'>,
): boolean {
  return withinRupiah(line.quantity * line.unit_price, line.line_subtotal);
}

export function linesSumOk(lineSubtotals: number[], subtotal: number): boolean {
  if (lineSubtotals.length === 0) return false;
  const sum = lineSubtotals.reduce((total, value) => total + cents(value), 0);
  return Math.abs(sum - cents(subtotal)) <= cents(subtotal) * LINES_SUM_TOLERANCE + 1e-6;
}
