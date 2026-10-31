/** Product doc 6.3. Pure string rules, shared by the checks and the matching engine. */

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2, peb: 2, pebruari: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, ags: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11, nop: 11, nopember: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

const groupedBy = (separator: string) => new RegExp(`^\\d{1,3}(\\${separator}\\d{3})+$`);

function parseWhole(digits: string, separator?: string): string | null {
  if (/^\d+$/.test(digits)) return digits;
  if (separator && groupedBy(separator).test(digits)) return digits.split(separator).join('');
  return null;
}

/** Decides which separator is the decimal one. A lone separator followed by exactly 3 digits at the end is thousands. */
export function normalizeMoney(input: string): number | null {
  const text = input
    .replace(/rp\.?|idr/gi, '')
    .replace(/[,.]-$/, '')
    .replace(/\s/g, '');
  if (!/^\d[\d.,]*\d$|^\d$/.test(text)) return null;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  let whole: string | null;
  let fraction = '';

  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    const at = text.lastIndexOf(decimal);
    whole = parseWhole(text.slice(0, at), thousands);
    fraction = text.slice(at + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? '.' : ',';
    const parts = text.split(separator);
    if (parts.length === 2 && parts[1].length !== 3) {
      whole = parts[0];
      fraction = parts[1];
    } else {
      whole = parseWhole(text, separator);
    }
  } else {
    whole = text;
  }

  return whole === null ? null : Math.round(Number(`${whole}.${fraction || '0'}`) * 100) / 100;
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date.toISOString().slice(0, 10) : null;
}

/** dd/mm is assumed, never mm/dd. */
export function normalizeDate(input: string): string | null {
  const text = input.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) return isoDate(+m[1], +m[2], +m[3]);

  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})$/.exec(text);
  if (m) return isoDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);

  m = /^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})$/i.exec(text);
  if (m) return MONTHS[m[2].toLowerCase()] ? isoDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1]) : null;

  m = /^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(text);
  if (m) return MONTHS[m[1].toLowerCase()] ? isoDate(+m[3], MONTHS[m[1].toLowerCase()], +m[2]) : null;

  return null;
}

export function normalizeDigits(input: string): string {
  return input.replace(/\D/g, '');
}

export function normalizeText(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

/** INV-001 = INV001 = inv 001. Used for duplicate detection (product doc 7.1). */
export function normalizeInvoiceNumber(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
