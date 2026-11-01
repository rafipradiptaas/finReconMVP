import type {
  HistoryEntry,
  MatchInvoice,
  MatchPurchaseOrder,
  MatchVendor,
} from '@/lib/matching/types';

export const vendor = (over: Partial<MatchVendor> = {}): MatchVendor => ({
  id: 'v1',
  vendor_name: 'PT Sinar Logistik Nusantara',
  npwp: '011234567891000',
  bank_name: 'BCA',
  bank_account_number: '1234567890',
  bank_account_holder: 'PT SINAR LOGISTIK NUSANTARA',
  status: 'verified',
  ...over,
});

export const purchaseOrder = (over: Partial<MatchPurchaseOrder> = {}): MatchPurchaseOrder => ({
  id: 'po1',
  po_number: 'PO-2026-001',
  vendor_id: 'v1',
  po_date: '2026-07-01',
  total_amount: 15000000,
  lines: [
    { item_description: 'Jasa pengiriman', quantity: 10, unit_price: 1000000 },
    { item_description: 'Asuransi kargo', quantity: 10, unit_price: 500000 },
  ],
  ...over,
});

/** Matches the PO above exactly. */
export const invoice = (over: Partial<MatchInvoice> = {}): MatchInvoice => ({
  id: 'i1',
  invoice_number: 'INV-001',
  invoice_date: '2026-07-15',
  vendor_name: 'PT Sinar Logistik Nusantara',
  npwp: '011234567891000',
  po_number: 'PO-2026-001',
  bank_name: 'Bank BCA',
  bank_account_number: '1234567890',
  bank_account_holder: 'PT SINAR LOGISTIK NUSANTARA',
  subtotal: 15000000,
  tax_amount: 1650000,
  total_amount: 16650000,
  line_items: [
    { description: 'Jasa pengiriman', quantity: 10, unit_price: 1000000, line_subtotal: 10000000 },
    { description: 'Asuransi kargo', quantity: 10, unit_price: 500000, line_subtotal: 5000000 },
  ],
  ...over,
});

export const paid = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  invoice_id: 'h1',
  vendor_id: 'v1',
  invoice_number_normalized: 'H001',
  review_status: 'PAID',
  total_amount: 10000000,
  paid_at: '2026-06-01',
  ...over,
});
