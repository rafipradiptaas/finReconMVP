import type { MatchStatus, ReviewStatus, VendorStatus, VetoCode } from '@/types/domain';

export type MatchVendor = {
  id: string;
  vendor_name: string;
  npwp: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  status: VendorStatus;
};

export type MatchPurchaseOrder = {
  id: string;
  po_number: string;
  vendor_id: string;
  po_date: string;
  total_amount: number;
  lines: { item_description: string; quantity: number; unit_price: number }[];
};

export type MatchLineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  line_subtotal: number;
};

export type MatchInvoice = {
  id: string;
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
  line_items: MatchLineItem[];
};

/** Another invoice of this organization and its review state. */
export type HistoryEntry = {
  invoice_id: string;
  vendor_id: string | null;
  invoice_number_normalized: string | null;
  review_status: ReviewStatus;
  total_amount: number | null;
  paid_at: string | null;
};

export type ScoreComponent = { value: number; max: number };

export type ScoreBreakdown = {
  po_number: ScoreComponent;
  vendor_name: ScoreComponent;
  amount: ScoreComponent;
  line_items: ScoreComponent;
  consistency: ScoreComponent & { lines_sum: number; tax: number; date: number };
};

export type MatchResult = {
  status: MatchStatus;
  vetoCode: VetoCode | null;
  score: number | null;
  scoreBreakdown: ScoreBreakdown | null;
  anomalyFlag: boolean;
  anomalyReason?: string;
  pendingDuplicateWarning: boolean;
  vendorId: string | null;
  poId: string | null;
};
