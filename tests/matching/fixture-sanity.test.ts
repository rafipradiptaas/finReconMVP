import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { runMatching } from '@/lib/matching';
import { normalizeInvoiceNumber, normalizeName, normalizeNpwp } from '@/lib/matching/normalize';
import { jaroWinkler } from '@/lib/matching/similarity';
import type { HistoryEntry, MatchInvoice, MatchPurchaseOrder, MatchVendor } from '@/lib/matching/types';
import { allTruths, type Truth } from '../helpers/ground-truth';

const csv = <Row,>(path: string) =>
  Papa.parse<Row>(readFileSync(path, 'utf8'), { header: true, skipEmptyLines: true }).data;

const NOW = new Date('2026-10-31T00:00:00Z');

const vendorRows = csv<Record<string, string>>('fixtures/vendors.csv');
const vendors: MatchVendor[] = vendorRows.map((row) => ({
  id: row.vendor_code,
  vendor_name: row.vendor_name,
  npwp: row.npwp,
  bank_name: row.bank_name,
  bank_account_number: row.bank_account_number,
  bank_account_holder: row.bank_account_holder,
  status: row.status as MatchVendor['status'],
}));

const orders = new Map<string, MatchPurchaseOrder>();
for (const row of csv<Record<string, string>>('fixtures/purchase_orders.csv')) {
  const po =
    orders.get(row.po_number) ??
    ({
      id: row.po_number,
      po_number: row.po_number,
      vendor_id: row.vendor_code,
      po_date: row.po_date,
      total_amount: 0,
      lines: [],
    } satisfies MatchPurchaseOrder);
  po.lines.push({
    item_description: row.item_description,
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
  });
  po.total_amount += Number(row.quantity) * Number(row.unit_price);
  orders.set(row.po_number, po);
}
const purchaseOrders = [...orders.values()];

const history: HistoryEntry[] = csv<Record<string, string>>('fixtures/invoice_history.csv').map((row, i) => ({
  invoice_id: `history-${i}`,
  vendor_id: row.vendor_code,
  invoice_number_normalized: normalizeInvoiceNumber(row.invoice_number),
  review_status: 'PAID',
  total_amount: Number(row.total_amount),
  paid_at: row.paid_date,
}));

const toInvoice = ({ fields, doc_id }: Truth): MatchInvoice => ({
  ...fields,
  id: doc_id,
  line_items: fields.line_items.map(({ subtotal, ...line }) => ({ ...line, line_subtotal: subtotal })),
});

const match = (invoice: MatchInvoice, extra: HistoryEntry[] = []) =>
  runMatching(invoice, { vendors, purchaseOrders, history: [...history, ...extra], now: NOW });

const fixtures = allTruths().filter((truth) => truth.doc_id.startsWith('fx'));
const fixture = (id: string) => fixtures.find((truth) => truth.doc_id === id)!;
const matched = fixtures.filter((truth) => truth.expected.match_status !== null);

describe('generated fixtures meet their documented outcome', () => {
  it.each(matched.map((truth) => [truth.doc_id, truth] as const))('%s', (_, truth) => {
    const result = match(toInvoice(truth));
    expect({
      status: result.status,
      veto: result.vetoCode,
      anomaly: result.anomalyFlag,
    }).toEqual({
      status: truth.expected.match_status,
      veto: truth.expected.veto_code,
      anomaly: truth.expected.anomaly_flag,
    });
  });

  it('fixture 02 scores about 66', () => {
    expect(match(toInvoice(fixture('fx02'))).score).toBeCloseTo(66.11, 1);
  });

  it('fixture 04 matches once its number is corrected', () => {
    const corrected = { ...toInvoice(fixture('fx04')), invoice_number: 'INV-BKP-0728' };
    expect(match(corrected).status).toBe(fixture('fx04').expected.after_manual_correction);
  });

  it('fixture 01 uploaded again after approval is a duplicate', () => {
    const invoice = toInvoice(fixture('fx01'));
    const first: HistoryEntry = {
      invoice_id: 'first',
      vendor_id: 'V001',
      invoice_number_normalized: normalizeInvoiceNumber(invoice.invoice_number!),
      review_status: 'APPROVED',
      total_amount: invoice.total_amount,
      paid_at: null,
    };
    expect(match({ ...invoice, id: 'second' }, [first])).toMatchObject({
      status: 'REJECTED',
      vetoCode: 'VETO_DUPLICATE_INVOICE',
    });
  });
});

describe('fixture 09 really tests VETO_VENDOR_NOT_FOUND (D13)', () => {
  const fake = fixture('fx09').fields;

  it('has similarity below 0.95 to every master vendor', () => {
    const scores = vendors.map(({ vendor_name }) =>
      jaroWinkler(normalizeName(fake.vendor_name!), normalizeName(vendor_name)),
    );
    expect(Math.max(...scores)).toBeLessThan(0.95);
  });

  it('has an NPWP that is not in master data', () => {
    expect(vendors.map(({ npwp }) => normalizeNpwp(npwp!))).not.toContain(normalizeNpwp(fake.npwp!));
  });
});
