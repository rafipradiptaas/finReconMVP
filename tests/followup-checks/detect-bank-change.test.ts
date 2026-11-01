import { describe, expect, it } from 'vitest';
import { detectBankChangeRequest } from '@/lib/followup-checks';

const vendor = { bank_account_number: '1234567890', npwp: '012345678912000' };
const detect = (text: string) => detectBankChangeRequest(text, vendor);

describe('detectBankChangeRequest (product doc 10.5)', () => {
  it.each([
    'Terima kasih, nomor PO yang benar adalah PO-2026-003.',
    'Mohon maaf atas keterlambatan, invoice akan kami perbaiki minggu depan.',
    'The correct PO is PO-2026-003. Thanks for checking.',
    'Totalnya Rp 15.750.000 sudah termasuk PPN, tanggal 2026-07-21.',
    'Silakan transfer ke rekening 1234567890 seperti biasa.',
    'NPWP kami tetap 012345678912000.',
    'Nomor invoice kami INV-2026-0715.',
  ])('passes a benign reply: %s', (text) => {
    expect(detect(text)).toEqual({ flagged: false, reasons: [] });
  });

  it.each([
    ['Mohon transfer ke rekening baru kami', 'rekening baru'],
    ['Kami ganti rekening mulai bulan ini', 'ganti rekening'],
    ['Ada PERUBAHAN REKENING perusahaan', 'perubahan rekening'],
    ['Rekening lama sudah ditutup', 'rekening lama'],
    ['Please note our change of bank details', 'change of bank'],
    ['Pay to our new account please', 'new account'],
    ['Updated bank details attached', 'updated bank'],
  ])('flags a keyword: %s', (text, keyword) => {
    const result = detect(text);
    expect(result.flagged).toBe(true);
    expect(result.reasons).toEqual([`Kata kunci "${keyword}"`]);
  });

  it('flags any 8 to 20 digit number that is not the master account', () => {
    expect(detect('Transfer ke 9876543210 ya').reasons).toEqual([
      'Nomor 9876543210 berbeda dari rekening master',
    ]);
    expect(detect('nomor 12345678').flagged).toBe(true);
    expect(detect(`nomor ${'1'.repeat(20)}`).flagged).toBe(true);
  });

  it('warns on a phone number too: it looks like an account, and a warning costs a look', () => {
    expect(detect('Hubungi kami di 021-5551234.').flagged).toBe(true);
  });

  it('ignores 7 and 21 digit numbers', () => {
    expect(detect('nomor 1234567').flagged).toBe(false);
    expect(detect(`nomor ${'1'.repeat(21)}`).flagged).toBe(false);
  });

  it('reads an account written in groups', () => {
    expect(detect('Rek: 987-654-3210').reasons).toEqual(['Nomor 9876543210 berbeda dari rekening master']);
    expect(detect('Rek: 9876 5432 10').flagged).toBe(true);
    expect(detect('Rek: 1234-5678-90').flagged).toBe(false);
  });

  it('reports every signal once', () => {
    const text = 'Rekening baru kami 9876543210. Sekali lagi rekening baru: 9876543210.';
    expect(detect(text).reasons).toEqual([
      'Kata kunci "rekening baru"',
      'Nomor 9876543210 berbeda dari rekening master',
    ]);
  });

  it('treats every number as different when master has no account', () => {
    expect(detectBankChangeRequest('Nomor 1234567890', { bank_account_number: null, npwp: null }).flagged).toBe(true);
  });
});
