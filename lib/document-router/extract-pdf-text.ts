import { getDocumentProxy } from 'unpdf';
import { SAME_LINE_POINTS, textFromItems } from '@/lib/extraction-checks/text';
import type { TextItem } from '@/lib/extraction-checks/types';

/** Fewer characters than this means there is no usable text layer (product doc 6.1). */
export const MIN_TEXT_CHARS = 50;

/** The share of a font's height above the baseline; the rest of the box hangs below it. */
const ASCENT_RATIO = 0.8;

export type PdfText = { fullText: string; items: TextItem[] };

/**
 * Reads every text item with its page and position. bbox is in PDF points with
 * the origin at the top left of the page, so the viewer can scale it directly.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  // pdf.js detaches the buffer it receives, so it gets its own copy.
  const pdf = await getDocumentProxy(bytes.slice());
  const items: TextItem[] = [];

  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const { height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const [, , , fontHeight, x, baseline] = item.transform as number[];
      items.push({
        page: number,
        str: item.str,
        bbox: {
          x,
          y: height - baseline - fontHeight * ASCENT_RATIO,
          width: item.width,
          height: fontHeight,
        },
      });
    }
  }

  items.sort(
    (a, b) =>
      a.page - b.page ||
      (Math.abs(a.bbox.y - b.bbox.y) < SAME_LINE_POINTS ? a.bbox.x - b.bbox.x : a.bbox.y - b.bbox.y),
  );
  return { fullText: textFromItems(items), items };
}
