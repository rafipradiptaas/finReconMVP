import { BANK_ALIASES, BANK_NAME_NOISE } from './config';

export { normalizeInvoiceNumber } from '@/lib/extraction-checks/normalize';

function bankKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word && !BANK_NAME_NOISE.includes(word))
    .join(' ');
}

const BANK_BY_KEY = new Map(
  Object.entries(BANK_ALIASES).flatMap(([bank, names]) =>
    names.map((name) => [bankKey(name), bank] as const),
  ),
);

/** The canonical bank, or for an unknown bank its name without noise words. */
export function normalizeBankName(name: string): string {
  const key = bankKey(name);
  return BANK_BY_KEY.get(key) ?? key;
}

export function sameBank(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  const bank = normalizeBankName(a);
  return bank !== '' && bank === normalizeBankName(b);
}
