/**
 * Domain enums. Source of truth: docs/product-doc.md section 8.
 * Keep the string values identical to the Postgres enums in
 * supabase/migrations/.
 */

export const DOCUMENT_STATUSES = [
  'UPLOADED',
  'EXTRACTING',
  'EXTRACTED',
  'NEEDS_CORRECTION',
  'EXTRACTION_FAILED',
  'UNSUPPORTED_FORMAT',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const MATCH_STATUSES = [
  'REJECTED',
  'FULL_MATCH',
  'PARTIAL_MATCH',
  'NO_MATCH',
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const VETO_CODES = [
  'VETO_VENDOR_NOT_FOUND',
  'VETO_VENDOR_NOT_VERIFIED',
  'VETO_BANK_MISMATCH',
  'VETO_DUPLICATE_INVOICE',
] as const;
export type VetoCode = (typeof VETO_CODES)[number];

export const REVIEW_STATUSES = [
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED_BY_REVIEWER',
  'PAID',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const VENDOR_STATUSES = ['verified', 'unverified', 'suspended'] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const ROLES = ['admin', 'ap_staff', 'approver'] as const;
export type Role = (typeof ROLES)[number];

export const FIELD_CONFIDENCES = ['high', 'medium', 'low', 'manual'] as const;
export type FieldConfidence = (typeof FIELD_CONFIDENCES)[number];

export const FIELD_VERIFICATIONS = ['verified', 'unverified', 'manual'] as const;
export type FieldVerification = (typeof FIELD_VERIFICATIONS)[number];

export const FOLLOWUP_STATUSES = ['DRAFT', 'SENT', 'DISCARDED'] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

export const LLM_PURPOSES = [
  'extract_invoice',
  'extract_invoice_vision',
  'explain_match',
  'agent_followup',
  'agent_reply',
  'chatbot',
] as const;
export type LlmPurpose = (typeof LLM_PURPOSES)[number];

/** Extraction fields that hold a document at NEEDS_CORRECTION when null or unverified. */
export const CRITICAL_EXTRACTION_FIELDS = [
  'invoice_number',
  'subtotal',
  'total_amount',
  'bank_account_number',
  'npwp',
] as const;
export type CriticalExtractionField = (typeof CRITICAL_EXTRACTION_FIELDS)[number];

/**
 * Legal ReviewStatus transitions (section 8). There are no backward
 * transitions: a correction is an investigation note plus a new document.
 */
export const REVIEW_STATUS_TRANSITIONS: Record<ReviewStatus, readonly ReviewStatus[]> = {
  PENDING_REVIEW: ['APPROVED', 'REJECTED_BY_REVIEWER'],
  APPROVED: ['PAID'],
  REJECTED_BY_REVIEWER: [],
  PAID: [],
};

export function canTransitionReviewStatus(from: ReviewStatus, to: ReviewStatus): boolean {
  return REVIEW_STATUS_TRANSITIONS[from].includes(to);
}

/** Indonesian labels for the UI. Code stays English; labels do not. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  ap_staff: 'Staf AP',
  approver: 'Approver',
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  UPLOADED: 'Diunggah',
  EXTRACTING: 'Sedang diekstraksi',
  EXTRACTED: 'Terekstraksi',
  NEEDS_CORRECTION: 'Perlu koreksi',
  EXTRACTION_FAILED: 'Ekstraksi gagal',
  UNSUPPORTED_FORMAT: 'Format tidak didukung',
};

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  REJECTED: 'Ditolak',
  FULL_MATCH: 'Cocok penuh',
  PARTIAL_MATCH: 'Cocok sebagian',
  NO_MATCH: 'Tidak cocok',
};

export const VETO_LABELS: Record<VetoCode, string> = {
  VETO_VENDOR_NOT_FOUND: 'Vendor tidak ditemukan',
  VETO_VENDOR_NOT_VERIFIED: 'Vendor belum terverifikasi',
  VETO_BANK_MISMATCH: 'Rekening tidak cocok',
  VETO_DUPLICATE_INVOICE: 'Invoice duplikat',
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  PENDING_REVIEW: 'Menunggu review',
  APPROVED: 'Disetujui',
  REJECTED_BY_REVIEWER: 'Ditolak reviewer',
  PAID: 'Dibayar',
};

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  verified: 'Terverifikasi',
  unverified: 'Belum terverifikasi',
  suspended: 'Ditangguhkan',
};
