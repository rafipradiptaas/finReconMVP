import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { extractPdfText, MIN_TEXT_CHARS } from '../lib/document-router/extract-pdf-text';
import {
  CHECKS_VERSION,
  documentStatus,
  runExtractionChecks,
  type CheckedInvoice,
} from '../lib/extraction-checks';
import type { Effort } from '../lib/llm/config';
import { extractInvoice } from '../lib/llm/extract-invoice';
import { extractInvoiceVision } from '../lib/llm/extract-invoice-vision';

export type Truth = {
  doc_id: string;
  file: string;
  template: string;
  variant: Record<string, unknown>;
  fields: Record<string, unknown>;
};

export type BatchOptions = { model?: string; effort?: Effort; vision?: boolean };

export function loadTruths(dir = 'eval/data/ground_truth'): Map<string, Truth> {
  const truths = readdirSync(dir).map(
    (name): Truth => JSON.parse(readFileSync(join(dir, name), 'utf8')),
  );
  return new Map(truths.map((truth) => [basename(truth.file), truth]));
}

/** The app's extraction and checks, with no database (D11). */
export async function extractDocument(path: string, options: BatchOptions) {
  const bytes = new Uint8Array(readFileSync(path));
  const { vision, ...settings } = options;

  if (vision) {
    const data = Buffer.from(bytes).toString('base64');
    const result = await extractInvoiceVision([{ mediaType: 'application/pdf', data }], settings);
    const fields = result.ok ? runExtractionChecks(result.raw, { text: null, items: [] }) : null;
    return { result, fields, status: fields ? documentStatus(fields) : 'EXTRACTION_FAILED' };
  }

  const { fullText, items } = await extractPdfText(bytes);
  if (fullText.length < MIN_TEXT_CHARS) {
    return { result: null, fields: null, status: 'UNSUPPORTED_FORMAT' };
  }
  const result = await extractInvoice(fullText, settings);
  const fields = result.ok ? runExtractionChecks(result.raw, { text: fullText, items }) : null;
  return { result, fields, status: fields ? documentStatus(fields) : 'EXTRACTION_FAILED' };
}

export function fieldRows(docId: string, fields: CheckedInvoice) {
  const { line_items, ...scalars } = fields;
  const row = (field: string, value: (typeof scalars)[keyof typeof scalars] | (typeof line_items)[number]) => ({
    type: 'field',
    doc_id: docId,
    field,
    value: value.value,
    model_confidence: value.confidence,
    signals: value.signals,
    verification: value.verification,
  });
  return [
    ...Object.entries(scalars).map(([field, value]) => row(field, value)),
    ...line_items.map((line, index) => row(`line_items[${index}]`, line)),
  ];
}

function total(records: { input_tokens: number | null }[], key: string) {
  return records.reduce((sum, record) => sum + Number((record as Record<string, unknown>)[key] ?? 0), 0);
}

async function main() {
  config({ path: '.env.local', quiet: true });
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      model: { type: 'string' },
      effort: { type: 'string' },
      vision: { type: 'boolean', default: false },
      out: { type: 'string' },
    },
  });
  const folder = positionals[0];
  if (!folder) throw new Error('usage: extract-batch <folder> [--model m] [--effort e] [--vision] [--out f]');

  const truths = loadTruths();
  const lines: string[] = [];
  for (const name of readdirSync(folder).filter((file) => file.endsWith('.pdf')).sort()) {
    const truth = truths.get(name);
    const docId = truth?.doc_id ?? name;
    const { result, fields, status } = await extractDocument(join(folder, name), {
      model: values.model,
      effort: values.effort as Effort | undefined,
      vision: values.vision,
    });
    const records = result?.records ?? [];
    const failure = result && !result.ok ? `, ${result.errorCode}` : '';
    console.log(`${docId}: ${status} (${records.length} call${records.length === 1 ? '' : 's'}${failure})`);
    if (fields) for (const row of fieldRows(docId, fields)) lines.push(JSON.stringify(row));
    lines.push(
      JSON.stringify({
        type: 'document',
        doc_id: docId,
        status,
        error_code: result && !result.ok ? result.errorCode : null,
        model: result?.model ?? null,
        prompt_version: result?.promptVersion ?? null,
        checks_version: CHECKS_VERSION,
        input_tokens: total(records, 'input_tokens'),
        output_tokens: total(records, 'output_tokens'),
        cost_estimate_usd: total(records, 'cost_estimate_usd'),
        latency_ms: total(records, 'latency_ms'),
        variant: truth?.variant ?? null,
        template: truth?.template ?? null,
      }),
    );
  }

  const out = values.out ?? `eval/runs/${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${lines.join('\n')}\n`);
  console.log(`wrote ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
