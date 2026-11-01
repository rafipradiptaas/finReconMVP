import { describe, expect, it } from 'vitest';
import {
  applyCorrections,
  documentStatus,
  runExtractionChecks,
} from '@/lib/extraction-checks';
import { fieldVerification } from '@/lib/extraction-checks/verify';
import type { RawField, RawInvoice, TextItem } from '@/lib/extraction-checks/types';

const ok = <T,>(value: T, source = String(value)): RawField<T> => ({
  value,
  confidence: 'high',
  source_text: source,
});
const missing = <T,>(): RawField<T> => ({ value: null, confidence: 'low', source_text: null });

const LINES = `INVOICE INV-001 Tanggal 15/07/2026
PT Sinar Logistik Nusantara NPWP 01.123.456.7-891.000
PO-2026-001
Jasa kirim 12 Rp 1.850.000 Rp 22.200.000
Asuransi 12 Rp 150.000 Rp 1.800.000
Subtotal Rp 24.000.000 PPN Rp 2.640.000 Total Rp 26.640.000
Bank BCA No. Rek. 1234567890 a.n. PT SINAR LOGISTIK NUSANTARA`;
const ITEMS: TextItem[] = LINES.split('\n').map((str, i) => ({
  page: 1,
  str,
  bbox: { x: 10, y: 10 + i * 12, width: 400, height: 10 },
}));

const invoice = (over: Partial<RawInvoice> = {}): RawInvoice => ({
  invoice_number: ok('INV-001'),
  invoice_date: ok('2026-07-15', '15/07/2026'),
  vendor_name: ok('PT Sinar Logistik Nusantara'),
  npwp: ok('011234567891000', '01.123.456.7-891.000'),
  po_number: ok('PO-2026-001'),
  bank_name: ok('BCA'),
  bank_account_number: ok('1234567890'),
  bank_account_holder: ok('PT SINAR LOGISTIK NUSANTARA'),
  subtotal: ok(24000000, 'Rp 24.000.000'),
  tax_amount: ok(2640000, 'Rp 2.640.000'),
  total_amount: ok(26640000, 'Rp 26.640.000'),
  line_items: [
    ok(
      { description: 'Jasa kirim', quantity: 12, unit_price: 1850000, line_subtotal: 22200000 },
      'Jasa kirim 12 Rp 1.850.000 Rp 22.200.000',
    ),
    ok(
      { description: 'Asuransi', quantity: 12, unit_price: 150000, line_subtotal: 1800000 },
      'Asuransi 12 Rp 150.000 Rp 1.800.000',
    ),
  ],
  ...over,
});

const check = (raw: RawInvoice) => runExtractionChecks(raw, { text: LINES, items: ITEMS });

describe('fieldVerification', () => {
  const pass = { grounded: true, format_ok: true, arithmetic_ok: true };

  it('verified when every applicable signal passes and confidence is not low', () => {
    expect(fieldVerification('x', pass, 'high')).toBe('verified');
    expect(fieldVerification('x', pass, 'medium')).toBe('verified');
    expect(fieldVerification('x', { ...pass, arithmetic_ok: null }, 'high')).toBe('verified');
  });

  it('unverified when any signal fails, confidence is low, or the value is null', () => {
    expect(fieldVerification('x', { ...pass, grounded: false }, 'high')).toBe('unverified');
    expect(fieldVerification('x', { ...pass, format_ok: false }, 'high')).toBe('unverified');
    expect(fieldVerification('x', { ...pass, arithmetic_ok: false }, 'high')).toBe('unverified');
    expect(fieldVerification('x', pass, 'low')).toBe('unverified');
    expect(fieldVerification(null, pass, 'high')).toBe('unverified');
  });
});

describe('runExtractionChecks', () => {
  it('verifies a clean invoice and locates its evidence', () => {
    const checked = check(invoice());
    expect(documentStatus(checked)).toBe('EXTRACTED');
    expect(checked.subtotal.verification).toBe('verified');
    expect(checked.subtotal.signals).toEqual({ grounded: true, format_ok: true, arithmetic_ok: true });
    expect(checked.subtotal.evidence).toHaveLength(1);
    expect(checked.line_items.every((line) => line.verification === 'verified')).toBe(true);
    expect(checked.vendor_name.signals.arithmetic_ok).toBeNull();
  });

  it('holds a null critical field at NEEDS_CORRECTION', () => {
    const checked = check(invoice({ invoice_number: missing() }));
    expect(checked.invoice_number.verification).toBe('unverified');
    expect(documentStatus(checked)).toBe('NEEDS_CORRECTION');
  });

  it('holds a critical field that is not in the document', () => {
    const checked = check(invoice({ bank_account_number: ok('9999999999') }));
    expect(checked.bank_account_number.signals.grounded).toBe(false);
    expect(documentStatus(checked)).toBe('NEEDS_CORRECTION');
  });

  it('holds a low-confidence critical field even when every signal passes', () => {
    const checked = check(
      invoice({ npwp: { ...ok('011234567891000'), confidence: 'low' } }),
    );
    expect(checked.npwp.signals.grounded).toBe(true);
    expect(documentStatus(checked)).toBe('NEEDS_CORRECTION');
  });

  it('lets an unverified non-critical field through', () => {
    const checked = check(invoice({ po_number: ok('PO-9999') }));
    expect(checked.po_number.verification).toBe('unverified');
    expect(documentStatus(checked)).toBe('EXTRACTED');
  });

  it('fails the amounts when they do not add up', () => {
    const checked = check(invoice({ total_amount: ok(24000000, 'Rp 24.000.000') }));
    expect(checked.total_amount.signals.grounded).toBe(true);
    expect(checked.total_amount.signals.arithmetic_ok).toBe(false);
    expect(checked.subtotal.signals.arithmetic_ok).toBe(false);
    expect(documentStatus(checked)).toBe('NEEDS_CORRECTION');
  });

  it('fails the subtotal when the lines do not sum to it', () => {
    const lines = invoice().line_items.slice(0, 1);
    const checked = check(invoice({ line_items: lines }));
    expect(checked.subtotal.signals.arithmetic_ok).toBe(false);
    expect(checked.total_amount.signals.arithmetic_ok).toBe(true);
  });

  it('skips the line sum when the invoice has no lines', () => {
    const checked = check(invoice({ line_items: [] }));
    expect(checked.subtotal.signals.arithmetic_ok).toBe(true);
    expect(documentStatus(checked)).toBe('EXTRACTED');
  });

  describe('a non-PKP invoice with no tax (D24)', () => {
    const NON_PKP = `INVOICE INV-001 Tanggal 15/07/2026
PT Sinar Logistik Nusantara NPWP 01.123.456.7-891.000
Bank BCA No. Rek. 1234567890 a.n. PT SINAR LOGISTIK NUSANTARA
Total Rp 24.000.000`;
    const nonPkp = (tax: RawField<number>, amount = 24000000) =>
      invoice({
        tax_amount: tax,
        total_amount: ok(amount),
        subtotal: ok(24000000),
        line_items: [],
        po_number: missing(),
      });

    it.each([
      ['null', missing<number>()],
      ['zero', ok(0, '')],
    ])('verifies a %s tax when nothing on the page mentions tax', (_, tax) => {
      const checked = runExtractionChecks(nonPkp(tax), { text: NON_PKP, items: [] });
      expect(checked.tax_amount.verification).toBe('verified');
      expect(checked.subtotal.verification).toBe('verified');
      expect(checked.total_amount.verification).toBe('verified');
      expect(documentStatus(checked)).toBe('EXTRACTED');
    });

    it('stays unverified when any tax word is printed', () => {
      const text = `${NON_PKP}\nTax ID 01.123.456.7-891.000`;
      const checked = runExtractionChecks(nonPkp(missing()), { text, items: [] });
      expect(checked.tax_amount.verification).toBe('unverified');
      // A tax word alone proves nothing about the amounts, so the document goes on.
      expect(checked.total_amount.verification).toBe('verified');
      expect(documentStatus(checked)).toBe('EXTRACTED');
    });

    it('a printed PPN amount the model dropped fails the total too', () => {
      const text = `INVOICE INV-001 Tanggal 15/07/2026
PT Sinar Logistik Nusantara NPWP 01.123.456.7-891.000
Bank BCA No. Rek. 1234567890 a.n. PT SINAR LOGISTIK NUSANTARA
Subtotal  Rp 24.000.000
PPN 11%  Rp 2.640.000
TOTAL  Rp 26.640.000`;
      const checked = runExtractionChecks(nonPkp(missing()), { text, items: [] });
      expect(checked.tax_amount.verification).toBe('unverified');
      expect(checked.total_amount.signals.grounded).toBe(true);
      expect(checked.total_amount.signals.arithmetic_ok).toBe(false);
      expect(checked.total_amount.verification).toBe('unverified');
      expect(documentStatus(checked)).toBe('NEEDS_CORRECTION');
    });

    it('stays unverified when subtotal and total differ', () => {
      const raw = nonPkp(missing(), 25000000);
      const checked = runExtractionChecks(raw, { text: `${NON_PKP} Rp 25.000.000`, items: [] });
      expect(checked.tax_amount.verification).toBe('unverified');
    });

    it('stays unverified when the amounts it relies on are unverified', () => {
      const raw = { ...nonPkp(missing()), total_amount: { ...ok(24000000), confidence: 'low' as const } };
      const checked = runExtractionChecks(raw, { text: NON_PKP, items: [] });
      expect(checked.tax_amount.verification).toBe('unverified');
    });

    it('accepts a difference of Rp 1, boundary included', () => {
      const text = `${NON_PKP} Rp 24.000.001`;
      const checked = runExtractionChecks(nonPkp(missing(), 24000001), { text, items: [] });
      expect(checked.tax_amount.verification).toBe('verified');
    });

    it('stays unverified with no text to read (vision)', () => {
      const checked = runExtractionChecks(nonPkp(missing()), { text: null, items: [] });
      expect(checked.tax_amount.verification).toBe('unverified');
    });
  });

  it('with no text layer (vision), grounded does not apply', () => {
    const checked = runExtractionChecks(invoice(), { text: null, items: [] });
    expect(checked.subtotal.signals.grounded).toBeNull();
    expect(checked.subtotal.verification).toBe('verified');
    expect(checked.subtotal.evidence).toEqual([]);
  });
});

describe('applyCorrections', () => {
  it('records whether a manual value is on the page (D25)', () => {
    const checked = check(invoice());
    const manual = applyCorrections(checked, { invoice_number: 'INV-TIDAK-DICETAK' }, LINES);
    expect(manual.invoice_number.signals.grounded).toBe(false);
    expect(manual.invoice_number.verification).toBe('manual');

    const printed = String(checked.vendor_name.value);
    expect(applyCorrections(checked, { vendor_name: printed }, LINES).vendor_name.signals.grounded).toBe(true);
    expect(applyCorrections(checked, { po_number: null }, LINES).po_number.signals.grounded).toBeNull();
    expect(applyCorrections(checked, { subtotal: 987654 }, LINES).subtotal.signals.grounded).toBe(false);
    expect(applyCorrections(checked, { npwp: '999999999999999' }, LINES).npwp.signals.grounded).toBe(false);
    expect(applyCorrections(checked, { invoice_date: '2031-01-02' }, LINES).invoice_date.signals.grounded).toBe(false);
    expect(applyCorrections(checked, { invoice_number: 'INV-X' }, null).invoice_number.signals.grounded).toBeNull();
  });

  it('marks edited fields manual and releases the document', () => {
    const checked = check(invoice({ invoice_number: missing() }));
    const corrected = applyCorrections(checked, { invoice_number: 'INV-777' }, LINES);
    expect(corrected.invoice_number).toMatchObject({
      value: 'INV-777',
      confidence: 'manual',
      verification: 'manual',
    });
    expect(documentStatus(corrected)).toBe('EXTRACTED');
  });

  it('reruns arithmetic, so fixing one amount verifies the others', () => {
    const checked = check(invoice({ total_amount: ok(24000000, 'Rp 24.000.000') }));
    expect(checked.subtotal.verification).toBe('unverified');
    const corrected = applyCorrections(checked, { total_amount: 26640000 }, LINES);
    expect(corrected.total_amount.verification).toBe('manual');
    expect(corrected.subtotal.verification).toBe('verified');
    expect(documentStatus(corrected)).toBe('EXTRACTED');
  });

  it('keeps the document held when a correction breaks the arithmetic', () => {
    const corrected = applyCorrections(check(invoice()), { total_amount: 99 }, LINES);
    expect(corrected.subtotal.verification).toBe('unverified');
    expect(documentStatus(corrected)).toBe('NEEDS_CORRECTION');
  });

  it('does not touch a field it was not given', () => {
    const checked = check(invoice());
    expect(applyCorrections(checked, {}, LINES).vendor_name).toEqual(checked.vendor_name);
  });

  describe('the no-tax rule after a correction (D24)', () => {
    const TEXT = 'Terima kasih\nTotal Rp 24.000.000';
    const raw = () =>
      invoice({
        tax_amount: missing(),
        subtotal: ok(24000000),
        total_amount: ok(24000000),
        line_items: [],
      });

    it('confirms a null tax once a human fixes the amount it relied on', () => {
      const checked = runExtractionChecks(
        { ...raw(), total_amount: { ...ok(24000000), confidence: 'low' } },
        { text: TEXT, items: [] },
      );
      expect(checked.tax_amount.verification).toBe('unverified');
      const corrected = applyCorrections(checked, { total_amount: 24000000 }, TEXT);
      expect(corrected.tax_amount.verification).toBe('verified');
    });

    it('withdraws it when a correction makes subtotal and total differ', () => {
      const checked = runExtractionChecks(raw(), { text: TEXT, items: [] });
      expect(checked.tax_amount.verification).toBe('verified');
      const corrected = applyCorrections(checked, { total_amount: 30000000 }, TEXT);
      expect(corrected.tax_amount.verification).toBe('unverified');
    });

    it('a human-entered tax stays manual', () => {
      const checked = runExtractionChecks(raw(), { text: TEXT, items: [] });
      const corrected = applyCorrections(checked, { tax_amount: null }, TEXT);
      expect(corrected.tax_amount.verification).toBe('manual');
    });
  });
});
