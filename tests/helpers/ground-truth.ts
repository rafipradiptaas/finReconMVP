import { readdirSync, readFileSync } from 'node:fs';
import type { RawField, RawInvoice } from '@/lib/extraction-checks/types';

export type TruthFields = {
  invoice_number: string | null;
  invoice_date: string | null;
  vendor_name: string | null;
  npwp: string | null;
  po_number: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  line_items: { description: string; quantity: number; unit_price: number; subtotal: number }[];
};

export type Truth = {
  doc_id: string;
  file: string;
  template: string;
  fields: TruthFields;
  expected: {
    document_status: string;
    match_status: string | null;
    veto_code: string | null;
    anomaly_flag: boolean;
    after_manual_correction?: string;
  };
};

export const allTruths = (): Truth[] =>
  readdirSync('eval/data/ground_truth')
    .sort()
    .map((name) => JSON.parse(readFileSync(`eval/data/ground_truth/${name}`, 'utf8')));

const field = <T>(value: T | null): RawField<T> =>
  value === null
    ? { value: null, confidence: 'low', source_text: null }
    : { value, confidence: 'high', source_text: String(value) };

/** What a perfect extractor would return, so the checks run on real PDFs for free. */
export function perfectExtraction({ line_items, ...fields }: TruthFields): RawInvoice {
  return {
    ...(Object.fromEntries(
      Object.entries(fields).map(([name, value]) => [name, field(value)]),
    ) as Omit<RawInvoice, 'line_items'>),
    line_items: line_items.map(({ subtotal, ...line }) =>
      field({ ...line, line_subtotal: subtotal }),
    ),
  };
}
