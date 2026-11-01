/** Every matching number and table lives here (product doc 7). */

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
