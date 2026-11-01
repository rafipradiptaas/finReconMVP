import { VENDOR_NAME_MATCH_MIN } from './config';
import {
  normalizeAccount,
  normalizeInvoiceNumber,
  normalizeName,
  normalizeNpwp,
  sameBank,
} from './normalize';
import { jaroWinkler } from './similarity';
import type { HistoryEntry, MatchInvoice, MatchVendor } from './types';
import type { VetoCode } from '@/types/domain';

/** NPWP exact, else the single best name at or above the minimum. A tie is not found. */
export function identifyVendor(invoice: MatchInvoice, vendors: MatchVendor[]): MatchVendor | null {
  const npwp = normalizeNpwp(invoice.npwp ?? '');
  const byNpwp = npwp && vendors.find((vendor) => normalizeNpwp(vendor.npwp ?? '') === npwp);
  if (byNpwp) return byNpwp;

  const name = normalizeName(invoice.vendor_name ?? '');
  const scored = vendors.map((vendor) => ({
    vendor,
    similarity: jaroWinkler(name, normalizeName(vendor.vendor_name)),
  }));
  const best = Math.max(...scored.map(({ similarity }) => similarity), 0);
  if (best < VENDOR_NAME_MATCH_MIN) return null;
  const leaders = scored.filter(({ similarity }) => similarity === best);
  return leaders.length === 1 ? leaders[0].vendor : null;
}

/** A missing value on either side is a mismatch: an unknown account never passes. */
function sameText(
  a: string | null,
  b: string | null,
  normalize: (value: string) => string,
): boolean {
  if (a === null || b === null) return false;
  const value = normalize(a);
  return value !== '' && value === normalize(b);
}

function bankMatches(invoice: MatchInvoice, vendor: MatchVendor): boolean {
  return (
    sameText(invoice.bank_account_number, vendor.bank_account_number, normalizeAccount) &&
    sameBank(invoice.bank_name, vendor.bank_name) &&
    sameText(invoice.bank_account_holder, vendor.bank_account_holder, normalizeName)
  );
}

/** Vetoes in the fixed order of product doc 7.1. A veto cannot be overridden. */
export function checkVeto(
  invoice: MatchInvoice,
  vendor: MatchVendor | null,
  history: HistoryEntry[],
): { vetoCode: VetoCode | null; pendingDuplicateWarning: boolean } {
  const veto = (vetoCode: VetoCode) => ({ vetoCode, pendingDuplicateWarning: false });

  if (!vendor) return veto('VETO_VENDOR_NOT_FOUND');
  if (vendor.status !== 'verified') return veto('VETO_VENDOR_NOT_VERIFIED');
  if (!bankMatches(invoice, vendor)) return veto('VETO_BANK_MISMATCH');

  const number = normalizeInvoiceNumber(invoice.invoice_number ?? '');
  const twins = number
    ? history.filter(
        (entry) =>
          entry.invoice_id !== invoice.id &&
          entry.vendor_id === vendor.id &&
          entry.invoice_number_normalized === number,
      )
    : [];

  if (twins.some(({ review_status }) => review_status === 'APPROVED' || review_status === 'PAID')) {
    return veto('VETO_DUPLICATE_INVOICE');
  }
  return {
    vetoCode: null,
    pendingDuplicateWarning: twins.some(({ review_status }) => review_status === 'PENDING_REVIEW'),
  };
}
