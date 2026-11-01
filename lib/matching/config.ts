/** Every matching number and table lives here (product doc 7). */

export const VENDOR_NAME_MATCH_MIN = 0.95;

// Score weights. They sum to 100, with three consistency items.
export const PO_WEIGHT = 25;
export const VENDOR_NAME_WEIGHT = 15;
export const AMOUNT_WEIGHT = 25;
export const LINE_ITEMS_WEIGHT = 20;
export const CONSISTENCY_ITEM_WEIGHT = 5;

/** Amount scores in full up to this relative difference, falling linearly to 0 at the next. */
export const AMOUNT_FULL_TOLERANCE = 0.005;
export const AMOUNT_ZERO_AT = 0.05;

export const LINE_DESCRIPTION_MIN = 0.8;
export const LINE_UNIT_PRICE_TOLERANCE = 0.005;
export const LINES_SUM_TOLERANCE = 0.005;
export const TAX_TOLERANCE_RUPIAH = 1;

export const FULL_MATCH_MIN = 90;
export const PARTIAL_MATCH_MIN = 60;

export const ANOMALY_MIN_HISTORY = 6;
export const ANOMALY_HISTORY_MONTHS = 24;
export const ANOMALY_MULTIPLIER = 3;
export const ANOMALY_ABSOLUTE_THRESHOLD = 500_000_000;

// Jaro-Winkler, standard values.
export const JARO_WINKLER_SCALING = 0.1;
export const JARO_WINKLER_MAX_PREFIX = 4;

/**
 * Compared after uppercasing and stripping punctuation, so case and spacing do
 * not need their own entries. Applied to master data and invoices alike.
 */
export const BANK_ALIASES: Record<string, string[]> = {
  BCA: ['BCA', 'Bank BCA', 'Bank Central Asia', 'PT Bank Central Asia Tbk'],
  MANDIRI: ['Mandiri', 'Bank Mandiri', 'Bank Mandiri (Persero)', 'PT Bank Mandiri (Persero) Tbk'],
  BNI: ['BNI', 'Bank BNI', 'Bank Negara Indonesia', 'PT Bank Negara Indonesia (Persero) Tbk'],
  BRI: ['BRI', 'Bank BRI', 'Bank Rakyat Indonesia', 'PT Bank Rakyat Indonesia (Persero) Tbk'],
  BSI: ['BSI', 'Bank BSI', 'Bank Syariah Indonesia', 'PT Bank Syariah Indonesia Tbk'],
  'CIMB NIAGA': ['CIMB Niaga', 'CIMB', 'Bank CIMB Niaga', 'PT Bank CIMB Niaga Tbk'],
  PERMATA: ['Permata', 'Bank Permata', 'PermataBank', 'PT Bank Permata Tbk'],
  DANAMON: ['Danamon', 'Bank Danamon', 'Bank Danamon Indonesia', 'PT Bank Danamon Indonesia Tbk'],
  BTN: ['BTN', 'Bank BTN', 'Bank Tabungan Negara', 'PT Bank Tabungan Negara (Persero) Tbk'],
};

export const BANK_NAME_NOISE = ['BANK', 'PT', 'TBK'];
