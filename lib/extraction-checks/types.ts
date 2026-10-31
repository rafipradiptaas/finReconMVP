import type { CriticalExtractionField, FieldConfidence, FieldVerification } from '@/types/domain';

export type BBox = { x: number; y: number; width: number; height: number };
export type TextItem = { page: number; str: string; bbox: BBox };
export type Evidence = { page: number; bbox: BBox };

/** One field as read by the extractor. This folder never imports the extractor itself. */
export type RawField<T> = {
  value: T | null;
  confidence: Exclude<FieldConfidence, 'manual'>;
  source_text: string | null;
};

export type LineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  line_subtotal: number;
};

export type RawInvoice = {
  invoice_number: RawField<string>;
  invoice_date: RawField<string>;
  vendor_name: RawField<string>;
  npwp: RawField<string>;
  po_number: RawField<string>;
  bank_name: RawField<string>;
  bank_account_number: RawField<string>;
  bank_account_holder: RawField<string>;
  subtotal: RawField<number>;
  tax_amount: RawField<number>;
  total_amount: RawField<number>;
  line_items: RawField<LineItem>[];
};

export const TEXT_FIELDS = [
  'invoice_number',
  'vendor_name',
  'po_number',
  'bank_name',
  'bank_account_holder',
] as const;
export const AMOUNT_FIELDS = ['subtotal', 'tax_amount', 'total_amount'] as const;

/** null = the signal does not apply to this field. */
export type Signals = {
  grounded: boolean | null;
  format_ok: boolean | null;
  arithmetic_ok: boolean | null;
};

export type CheckedField<T> = {
  value: T | null;
  confidence: FieldConfidence;
  source_text: string | null;
  signals: Signals;
  evidence: Evidence[];
  verification: FieldVerification;
};

export type CheckedInvoice = {
  [K in Exclude<keyof RawInvoice, 'line_items'>]: CheckedField<NonNullable<RawInvoice[K]['value']>>;
} & { line_items: CheckedField<LineItem>[] };

export type { CriticalExtractionField };
