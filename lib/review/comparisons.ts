import { FIELD_LABELS } from '@/types/domain';

type Value = string | number | null;

export type Comparison = {
  field: string;
  source: 'vendor' | 'po';
  invoiceValue: Value;
  masterValue: Value;
};

type Invoice = {
  vendor_name: string | null;
  npwp: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  po_number: string | null;
  invoice_date: string | null;
  subtotal: number | null;
};
type Vendor = {
  vendor_name: string;
  npwp: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
};
type PurchaseOrder = { po_number: string; po_date: string; total_amount: number };

/** The side-by-side rows of the review panel, and the values the explanation may quote. */
export function buildComparisons(invoice: Invoice, vendor: Vendor | null, po: PurchaseOrder | null): Comparison[] {
  const master = (name: keyof Vendor): Comparison => ({
    field: FIELD_LABELS[name],
    source: 'vendor',
    invoiceValue: invoice[name],
    masterValue: vendor?.[name] ?? null,
  });
  return [
    master('vendor_name'),
    master('npwp'),
    master('bank_name'),
    master('bank_account_number'),
    master('bank_account_holder'),
    { field: FIELD_LABELS.po_number, source: 'po', invoiceValue: invoice.po_number, masterValue: po?.po_number ?? null },
    { field: 'Tanggal invoice / PO', source: 'po', invoiceValue: invoice.invoice_date, masterValue: po?.po_date ?? null },
    { field: 'Subtotal / total PO', source: 'po', invoiceValue: invoice.subtotal, masterValue: po?.total_amount ?? null },
  ];
}
