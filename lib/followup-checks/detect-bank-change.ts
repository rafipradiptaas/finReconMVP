import { ACCOUNT_MAX_DIGITS, ACCOUNT_MIN_DIGITS, BANK_CHANGE_KEYWORDS } from './config';

type Vendor = { bank_account_number: string | null; npwp: string | null };

const digitsOf = (value: string) => value.replace(/\D/g, '');

// Spaces and dashes may group a number. Dots may not: 15.750.000 is an amount.
const NUMBER = /(?<![\d.,-])\d(?:[ -]?\d)+(?![\d-])/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Flags a reply that may be asking to change the payment account. It only ever
 * warns: a false alarm costs a look, a miss costs a payment, so any long number
 * we do not know counts. The vendor's own account and NPWP do not.
 */
export function detectBankChangeRequest(text: string, vendor: Vendor) {
  const lower = text.toLowerCase().replace(/\s+/g, ' ');
  const keywords = BANK_CHANGE_KEYWORDS.filter((keyword) => lower.includes(keyword)).map(
    (keyword) => `Kata kunci "${keyword}"`,
  );

  const known = [vendor.bank_account_number, vendor.npwp].map((value) => digitsOf(value ?? ''));
  const numbers = (text.match(NUMBER) ?? [])
    .filter((run) => !ISO_DATE.test(run))
    .map(digitsOf)
    .filter(
      (digits) =>
        digits.length >= ACCOUNT_MIN_DIGITS && digits.length <= ACCOUNT_MAX_DIGITS && !known.includes(digits),
    )
    .map((digits) => `Nomor ${digits} berbeda dari rekening master`);

  const reasons = [...new Set([...keywords, ...numbers])];
  return { flagged: reasons.length > 0, reasons };
}
