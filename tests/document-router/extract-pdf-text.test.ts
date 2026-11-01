import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isPdf } from '@/lib/document-router/detect-file-type';
import { extractPdfText, MIN_TEXT_CHARS } from '@/lib/document-router/extract-pdf-text';

const read = (name: string) => new Uint8Array(readFileSync(`fixtures/invoices/${name}`));

describe('isPdf', () => {
  it('goes by the file content', () => {
    expect(isPdf(read('01_full_match_V001.pdf'))).toBe(true);
    expect(isPdf(new TextEncoder().encode('vendor_code,vendor_name'))).toBe(false);
    expect(isPdf(new Uint8Array())).toBe(false);
  });
});

describe('extractPdfText', () => {
  it('returns text with page and position', async () => {
    const { fullText, items } = await extractPdfText(read('01_full_match_V001.pdf'));
    expect(fullText.length).toBeGreaterThan(MIN_TEXT_CHARS);
    expect(fullText).toContain('INV-SLN-2026-0715');

    const title = items.find((item) => item.str === 'INVOICE')!;
    const total = items.find((item) => item.str === 'TOTAL')!;
    expect(title.page).toBe(1);
    expect(title.bbox.width).toBeGreaterThan(0);
    expect(title.bbox.height).toBeGreaterThan(0);
    expect(total.bbox.y).toBeGreaterThan(title.bbox.y);
  });

  it('keeps one printed row on one line of text', async () => {
    const { fullText } = await extractPdfText(read('01_full_match_V001.pdf'));
    expect(fullText).toMatch(/Subtotal\s+Rp 24\.000\.000/);
  });

  it('reads items from every page', async () => {
    const pdf = new Uint8Array(readFileSync('eval/data/pdfs/ev11.pdf'));
    const { items } = await extractPdfText(pdf);
    expect(new Set(items.map((item) => item.page))).toEqual(new Set([1, 2]));
  });

  it('leaves a scanned PDF under the text threshold', async () => {
    const { fullText } = await extractPdfText(read('10_unsupported_scanned_image_only.pdf'));
    expect(fullText.length).toBeLessThan(MIN_TEXT_CHARS);
  });
});
