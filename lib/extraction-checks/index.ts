import { CRITICAL_EXTRACTION_FIELDS, type FieldConfidence, type FieldVerification } from '@/types/domain';
import { locateEvidence } from './locate-evidence';
import { normalizeDate, normalizeDigits } from './normalize';
import {
  amountsConsistent,
  formatOk,
  groundedDate,
  groundedDigits,
  groundedMoney,
  groundedText,
  groundedWords,
  hasTaxKeyword,
  lineArithmeticOk,
  linesSumOk,
  printsTaxAmount,
} from './signals';
import {
  AMOUNT_FIELDS,
  TEXT_FIELDS,
  type CheckedField,
  type CheckedInvoice,
  type LineItem,
  type RawField,
  type RawInvoice,
  type Signals,
  type TextItem,
} from './types';
import { fieldVerification } from './verify';

export { CHECKS_VERSION } from './config';
export { textFromItems } from './text';
export type { CheckedField, CheckedInvoice, LineItem, RawInvoice, TextItem } from './types';

/** text is null when there is no text layer (vision): grounded then does not apply. */
export type DocumentText = { text: string | null; items: TextItem[] };

function checked<T>(
  raw: RawField<T>,
  items: TextItem[],
  signals: Omit<Signals, 'arithmetic_ok'> & { arithmetic_ok?: boolean | null },
): CheckedField<T> {
  const full = { arithmetic_ok: null, ...signals };
  return {
    value: raw.value,
    confidence: raw.confidence,
    source_text: raw.source_text,
    signals: raw.value === null ? { grounded: null, format_ok: null, arithmetic_ok: null } : full,
    evidence: locateEvidence(raw.source_text, items),
    verification: fieldVerification(raw.value, full, raw.confidence),
  };
}

function checkLine(raw: RawField<LineItem>, text: string | null, items: TextItem[], sumOk: boolean | null) {
  const line = raw.value;
  const grounded =
    text === null || line === null
      ? null
      : groundedWords(line.description, text) &&
        groundedMoney(line.quantity, text) &&
        groundedMoney(line.unit_price, text) &&
        groundedMoney(line.line_subtotal, text);
  return checked(raw, items, {
    grounded,
    format_ok: null,
    arithmetic_ok: line === null ? null : lineArithmeticOk(line) && sumOk !== false,
  });
}

const noTax = (tax: number | null) => tax === null || tax === 0;

/** Every arithmetic rule, as of the current values. text is null with no text layer. */
function arithmetic(
  fields: { subtotal: number | null; tax: number | null; total: number | null; lines: (LineItem | null)[] },
  text: string | null,
) {
  const present = fields.lines.filter((line) => line !== null);
  const amountsOk = amountsConsistent(fields.subtotal, fields.tax, fields.total);
  const sumOk =
    present.length === 0 || fields.subtotal === null
      ? null
      : linesSumOk(
          present.map((line) => line.line_subtotal),
          fields.subtotal,
        );
  const droppedTax =
    noTax(fields.tax) &&
    text !== null &&
    fields.subtotal !== null &&
    printsTaxAmount(fields.subtotal, text);
  return { amountsOk, sumOk, totalOk: amountsOk && !droppedTax };
}

/**
 * A null or zero tax is confirmed, not merely absent, only when the amounts it
 * rests on are trusted, they agree, and nothing on the page mentions tax (D24).
 */
function withNoTaxRule(fields: CheckedInvoice, text: string | null): CheckedInvoice {
  const { subtotal, tax_amount, total_amount } = fields;
  if (!noTax(tax_amount.value) || tax_amount.verification === 'manual') return fields;
  const confirmed =
    text !== null &&
    !hasTaxKeyword(text) &&
    subtotal.verification !== 'unverified' &&
    total_amount.verification !== 'unverified' &&
    amountsConsistent(subtotal.value, null, total_amount.value);
  return {
    ...fields,
    tax_amount: { ...tax_amount, verification: confirmed ? 'verified' : 'unverified' },
  };
}

export function runExtractionChecks(raw: RawInvoice, { text, items }: DocumentText): CheckedInvoice {
  const grounded = (check: (haystack: string) => boolean) => (text === null ? null : check(text));

  const textField = (field: (typeof TEXT_FIELDS)[number]) => {
    const { value } = raw[field];
    return checked(raw[field], items, {
      grounded: value === null ? null : grounded((t) => groundedText(value, t)),
      format_ok: value === null ? null : formatOk(field, value),
    });
  };
  const digitField = (field: 'npwp' | 'bank_account_number') => {
    const { value } = raw[field];
    return checked(raw[field], items, {
      grounded: value === null ? null : grounded((t) => groundedDigits(normalizeDigits(value), t)),
      format_ok: value === null ? null : formatOk(field, value),
    });
  };

  const { amountsOk, sumOk, totalOk } = arithmetic(
    {
      subtotal: raw.subtotal.value,
      tax: raw.tax_amount.value,
      total: raw.total_amount.value,
      lines: raw.line_items.map((line) => line.value),
    },
    text,
  );
  const amountField = (field: (typeof AMOUNT_FIELDS)[number], arithmeticOk: boolean) => {
    const { value } = raw[field];
    return checked(raw[field], items, {
      // A zero tax on a non-PKP invoice is usually not printed at all.
      grounded: value === null || value === 0 ? null : grounded((t) => groundedMoney(value, t)),
      format_ok: value === null ? null : formatOk(field, value),
      arithmetic_ok: arithmeticOk,
    });
  };

  const date = raw.invoice_date.value;
  const iso = date === null ? null : normalizeDate(date);
  const fields: CheckedInvoice = {
    invoice_number: textField('invoice_number'),
    invoice_date: checked(raw.invoice_date, items, {
      grounded: iso === null ? (date === null ? null : false) : grounded((t) => groundedDate(iso, t)),
      format_ok: date === null ? null : formatOk('invoice_date', date),
    }),
    vendor_name: textField('vendor_name'),
    npwp: digitField('npwp'),
    po_number: textField('po_number'),
    bank_name: textField('bank_name'),
    bank_account_number: digitField('bank_account_number'),
    bank_account_holder: textField('bank_account_holder'),
    subtotal: amountField('subtotal', amountsOk && sumOk !== false),
    tax_amount: amountField('tax_amount', amountsOk),
    total_amount: amountField('total_amount', totalOk),
    line_items: raw.line_items.map((line) => checkLine(line, text, items, sumOk)),
  };
  return withNoTaxRule(fields, text);
}

/** NEEDS_CORRECTION iff any critical field is null or unverified (product doc 6.4). */
export function documentStatus(fields: CheckedInvoice): 'EXTRACTED' | 'NEEDS_CORRECTION' {
  const held = CRITICAL_EXTRACTION_FIELDS.some(
    (name) => fields[name].value === null || fields[name].verification === 'unverified',
  );
  return held ? 'NEEDS_CORRECTION' : 'EXTRACTED';
}

export type ScalarField = Exclude<keyof CheckedInvoice, 'line_items'>;
export type Corrections = Partial<Record<ScalarField, string | number | null>>;

function rechecked<T>(field: CheckedField<T>, arithmeticOk: boolean | null): CheckedField<T> {
  if (field.value === null) return field;
  const signals = { ...field.signals, arithmetic_ok: arithmeticOk };
  const verification: FieldVerification =
    field.verification === 'manual'
      ? 'manual'
      : fieldVerification(field.value, signals, field.confidence);
  return { ...field, signals, verification };
}

/**
 * A human correction is trusted as given (manual). The arithmetic is then
 * rerun, because fixing one amount can confirm or break the others.
 */
export function applyCorrections(
  fields: CheckedInvoice,
  corrections: Corrections,
  text: string | null,
): CheckedInvoice {
  const next = { ...fields };
  for (const [name, value] of Object.entries(corrections) as [ScalarField, string | number | null][]) {
    const manual: FieldConfidence = 'manual';
    next[name] = {
      value,
      confidence: manual,
      source_text: null,
      signals: { grounded: null, format_ok: null, arithmetic_ok: null },
      evidence: [],
      verification: 'manual',
    } as never;
  }

  const { amountsOk, sumOk, totalOk } = arithmetic(
    {
      subtotal: next.subtotal.value,
      tax: next.tax_amount.value,
      total: next.total_amount.value,
      lines: next.line_items.map((line) => line.value),
    },
    text,
  );
  return withNoTaxRule(
    {
      ...next,
      subtotal: rechecked(next.subtotal, amountsOk && sumOk !== false),
      tax_amount: rechecked(next.tax_amount, amountsOk),
      total_amount: rechecked(next.total_amount, totalOk),
      line_items: next.line_items.map((line) =>
        rechecked(line, line.value === null ? null : lineArithmeticOk(line.value) && sumOk !== false),
      ),
    },
    text,
  );
}
