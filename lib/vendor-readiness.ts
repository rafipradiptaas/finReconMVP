export type VendorReadiness = 'Aman' | 'Perlu Review' | 'Belum Siap';

const VERIFICATION_VALID_MONTHS = 12;

type ReadinessInput = {
  status: string;
  npwp: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  last_verified_at: string | null;
};

/** Display-only indicator (product doc 5.3). It never changes vendor status. */
export function vendorReadiness(vendor: ReadinessInput, now: Date): VendorReadiness {
  const complete =
    vendor.npwp && vendor.bank_name && vendor.bank_account_number && vendor.bank_account_holder;
  if (vendor.status !== 'verified' || !complete) return 'Belum Siap';

  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - VERIFICATION_VALID_MONTHS);
  const fresh =
    vendor.last_verified_at !== null &&
    vendor.last_verified_at >= cutoff.toISOString().slice(0, 10);
  return fresh ? 'Aman' : 'Perlu Review';
}
