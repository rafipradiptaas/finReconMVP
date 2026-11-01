import { describe, expect, it } from 'vitest';
import {
  amountsConsistent,
  formatOk,
  groundedDate,
  groundedDigits,
  groundedMoney,
  groundedText,
  hasTaxKeyword,
  lineArithmeticOk,
  linesSumOk,
  printsTaxAmount,
} from '@/lib/extraction-checks/signals';

const TEXT = `INVOICE INV-2026-001
Tanggal: 31 Oktober 2026
NPWP 01.123.456.7-891.000
Subtotal Rp 15.750.000,00
No. Rek. 1234-5678 90 a.n. PT SINAR LOGISTIK
Grand Total 17,482,500.00`;

describe('grounded', () => {
  it('finds money printed in either number style', () => {
    expect(groundedMoney(15750000, TEXT)).toBe(true);
    expect(groundedMoney(17482500, TEXT)).toBe(true);
  });

  it('does not ground a number the document never prints', () => {
    expect(groundedMoney(15750001, TEXT)).toBe(false);
    expect(groundedMoney(750000, TEXT)).toBe(false);
  });

  it('finds a date in any printed format', () => {
    expect(groundedDate('2026-10-31', TEXT)).toBe(true);
    expect(groundedDate('2026-10-30', TEXT)).toBe(false);
    expect(groundedDate('2026-10-31', 'Date: Oct 31, 2026')).toBe(true);
    expect(groundedDate('2026-10-31', 'Tanggal 31/10/2026')).toBe(true);
  });

  it('is not fooled by a number right before a labelled date', () => {
    expect(groundedDate('2026-07-21', 'PO-2026-004\nTANGGAL  2026-07-21')).toBe(true);
  });

  it('finds digits through separators but never inside a longer number', () => {
    expect(groundedDigits('011234567891000', TEXT)).toBe(true);
    expect(groundedDigits('1234567890', TEXT)).toBe(true);
    expect(groundedDigits('234567890', TEXT)).toBe(false);
    expect(groundedDigits('12345678', TEXT)).toBe(false);
  });

  it('matches text case-insensitively across whitespace', () => {
    expect(groundedText('pt  sinar logistik', TEXT)).toBe(true);
    expect(groundedText('PT Cahaya', TEXT)).toBe(false);
  });

  it('does not confuse the letter O with a zero', () => {
    expect(groundedText('INV-2026-OO1', TEXT)).toBe(false);
    expect(groundedText('INV-2026-001', TEXT)).toBe(true);
  });

  it('requires a whole token', () => {
    expect(groundedText('INV-2026-00', TEXT)).toBe(false);
  });
});

describe('format_ok', () => {
  it('npwp has 15 or 16 digits', () => {
    expect(formatOk('npwp', '011234567891000')).toBe(true);
    expect(formatOk('npwp', '0112345678910001')).toBe(true);
    expect(formatOk('npwp', '01123456789100')).toBe(false);
    expect(formatOk('npwp', '01123456789100O')).toBe(false);
  });

  it('account has 6 to 20 digits and no letters', () => {
    expect(formatOk('bank_account_number', '123456')).toBe(true);
    expect(formatOk('bank_account_number', '1'.repeat(20))).toBe(true);
    expect(formatOk('bank_account_number', '12345')).toBe(false);
    expect(formatOk('bank_account_number', '1'.repeat(21))).toBe(false);
    expect(formatOk('bank_account_number', '123O456')).toBe(false);
  });

  it('date must be valid', () => {
    expect(formatOk('invoice_date', '2026-10-31')).toBe(true);
    expect(formatOk('invoice_date', '2026-02-31')).toBe(false);
  });

  it('invoice number must not be empty', () => {
    expect(formatOk('invoice_number', 'A1')).toBe(true);
    expect(formatOk('invoice_number', '   ')).toBe(false);
  });

  it('money must not be negative', () => {
    expect(formatOk('subtotal', 0)).toBe(true);
    expect(formatOk('total_amount', -1)).toBe(false);
  });
});

describe('arithmetic_ok', () => {
  it('subtotal + tax = total within Rp 1, boundary included', () => {
    expect(amountsConsistent(1000, 110, 1110)).toBe(true);
    expect(amountsConsistent(1000, 110, 1111)).toBe(true);
    expect(amountsConsistent(1000, 110, 1109)).toBe(true);
    expect(amountsConsistent(1000, 110, 1111.01)).toBe(false);
    expect(amountsConsistent(1000, 110, 1108.99)).toBe(false);
  });

  it('non-PKP: no tax means subtotal = total', () => {
    expect(amountsConsistent(3900000, null, 3900000)).toBe(true);
    expect(amountsConsistent(3900000, 0, 3900000)).toBe(true);
    expect(amountsConsistent(3900000, null, 4329000)).toBe(false);
  });

  it('a missing subtotal or total cannot be consistent', () => {
    expect(amountsConsistent(null, 110, 1110)).toBe(false);
    expect(amountsConsistent(1000, 110, null)).toBe(false);
  });

  it('line: quantity × unit price = line subtotal within Rp 1', () => {
    expect(lineArithmeticOk({ quantity: 12, unit_price: 1850000, line_subtotal: 22200000 })).toBe(true);
    expect(lineArithmeticOk({ quantity: 3, unit_price: 33.33, line_subtotal: 100 })).toBe(true);
    expect(lineArithmeticOk({ quantity: 12, unit_price: 1850000, line_subtotal: 22200001 })).toBe(true);
    expect(lineArithmeticOk({ quantity: 12, unit_price: 1850000, line_subtotal: 22200002 })).toBe(false);
  });

  it('Σ lines ≈ subtotal within 0.5%, boundary included', () => {
    expect(linesSumOk([1005], 1000)).toBe(true);
    expect(linesSumOk([995], 1000)).toBe(true);
    expect(linesSumOk([500, 505], 1000)).toBe(true);
    expect(linesSumOk([1005.01], 1000)).toBe(false);
    expect(linesSumOk([], 1000)).toBe(false);
  });
});

describe('tax lines (D24)', () => {
  it.each(['PPN 11%', 'ppn', 'Pajak', 'VAT 11%', 'Sales Tax', 'Pajak Pertambahan Nilai'])(
    'finds %s, in any case',
    (text) => {
      expect(hasTaxKeyword(`Subtotal 100\n${text}\nTotal 100`)).toBe(true);
    },
  );

  it('matches whole words only', () => {
    expect(hasTaxKeyword('Taxi Bandara\nSUPPNA\nNPWP 01.123.456.7-891.000')).toBe(false);
  });

  it('proves a dropped tax line when subtotal + the tax amount is printed', () => {
    const text = 'Subtotal  Rp 24.000.000\nPPN 11%  Rp 2.640.000\nTOTAL  Rp 26.640.000';
    expect(printsTaxAmount(24000000, text)).toBe(true);
  });

  it('is not fooled by other numbers on a line with a tax word', () => {
    const text =
      'Tax ID (NPWP) 01.123.456.7-891.000\nFaktur Pajak tgl 15/07/2026\nHarga termasuk PPN 11%\nTOTAL  Rp 3.900.000';
    expect(printsTaxAmount(3900000, text)).toBe(false);
  });

  it('a zero tax line proves nothing', () => {
    expect(printsTaxAmount(1000, 'PPN  Rp 0\nTotal  Rp 1.000')).toBe(false);
  });
});
