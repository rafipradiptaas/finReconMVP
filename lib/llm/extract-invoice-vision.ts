import { EXTRACTION_RULES, runExtraction, type ExtractionResult } from './extract-invoice';
import type { LlmImage } from './types';
import type { Effort } from './config';

/**
 * Scripts only (scripts/extract-batch.ts). Never import this from an app route:
 * in the app, a scan stays UNSUPPORTED_FORMAT (product doc 6.1).
 */
export const PROMPT_VERSION = 'extract-invoice-vision-1';

const SYSTEM = `${EXTRACTION_RULES}

The input is an image or scanned PDF of the invoice. source_text is what you read on the page.`;

export function extractInvoiceVision(
  images: LlmImage[],
  options: { model?: string; effort?: Effort } = {},
): Promise<ExtractionResult> {
  return runExtraction({
    ...options,
    purpose: 'extract_invoice_vision',
    promptVersion: PROMPT_VERSION,
    system: SYSTEM,
    input: 'Extract the invoice fields from this document.',
    images,
  });
}
