/** Stored with every extraction. Bump it whenever a rule in this folder changes. */
export const CHECKS_VERSION = 'checks-2';

export const AMOUNT_TOLERANCE_RUPIAH = 1;
export const LINES_SUM_TOLERANCE = 0.005;

export const NPWP_DIGITS = [15, 16];
export const ACCOUNT_MIN_DIGITS = 6;
export const ACCOUNT_MAX_DIGITS = 20;

/** Any of these on the page means a missing tax cannot be confirmed (D24). */
export const TAX_KEYWORDS = ['PPN', 'Pajak', 'VAT', 'Tax', 'Pajak Pertambahan Nilai'];
