import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import type { CheckedInvoice } from '@/lib/extraction-checks';
import type { LlmTool } from '@/lib/llm';
import { normalizeInvoiceNumber, normalizeName } from '@/lib/matching/normalize';
import { readAll } from '@/lib/server/read-all';
import type { Database } from '@/types/database.types';
import { MAX_FLAGGED_ROWS } from './config';
import { documentDetailInput, flaggedInput, invoiceStatusInput, vendorTotalInput } from './tool-schemas';

type Db = SupabaseClient<Database>;

const rupiah = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;
const defineTool = <Schema extends z.ZodType>(tool: LlmTool<Schema>) => tool as unknown as LlmTool;

function throwOn<Result extends { error: unknown }>(result: Result) {
  if (result.error) throw result.error;
  return result;
}

async function vendorTotal(db: Db, { vendor_name, period_start, period_end }: z.output<typeof vendorTotalInput>) {
  const { data: vendors } = throwOn(await db.from('vendors').select('id, vendor_name'));
  const wanted = normalizeName(vendor_name);
  const named = (vendors ?? []).map((vendor) => ({ ...vendor, name: normalizeName(vendor.vendor_name) }));
  const exact = named.filter(({ name }) => name === wanted);
  const found = exact.length > 0 ? exact : named.filter(({ name }) => name.includes(wanted));
  if (found.length === 0) return { found: false };
  if (found.length > 1) return { found: false, ambiguous: found.map((vendor) => vendor.vendor_name) };

  const rows = await readAll((from, to) => {
    let query = db
      .from('matches')
      .select('id, paid_at, invoices!inner(total_amount, vendor_id)')
      .eq('review_status', 'PAID')
      .eq('invoices.vendor_id', found[0].id)
      .order('id');
    if (period_start) query = query.gte('paid_at', period_start);
    if (period_end) query = query.lte('paid_at', `${period_end}T23:59:59.999Z`);
    return query.range(from, to);
  });

  // Whole sen, so a long sum of 2-decimal amounts cannot drift.
  const sen = rows.reduce((sum, { invoices }) => sum + Math.round((invoices.total_amount ?? 0) * 100), 0);
  const total = sen / 100;
  return {
    found: true,
    vendor_name: found[0].vendor_name,
    basis: 'invoice PAID, menurut tanggal bayar',
    period_start: period_start ?? null,
    period_end: period_end ?? null,
    invoice_count: rows.length,
    total_amount: total,
    total_amount_text: rupiah(total),
  };
}

async function invoiceStatus(db: Db, { invoice_number }: z.output<typeof invoiceStatusInput>) {
  const { data } = throwOn(
    await db
      .from('invoices')
      .select(
        'invoice_number, vendor_name, invoice_date, total_amount, documents(status), matches(status, review_status, veto_code, score, anomaly_flag)',
      )
      .eq('invoice_number_normalized', normalizeInvoiceNumber(invoice_number)),
  );
  if (!data || data.length === 0) return { found: false };
  return {
    found: true,
    invoices: data.map(({ total_amount, documents, matches, ...invoice }) => ({
      ...invoice,
      total_amount_text: total_amount === null ? null : rupiah(total_amount),
      document_status: documents?.status ?? null,
      match_status: matches?.status ?? null,
      review_status: matches?.review_status ?? null,
      veto_code: matches?.veto_code ?? null,
      score: matches?.score ?? null,
      anomaly_flag: matches?.anomaly_flag ?? false,
    })),
  };
}

const FLAGGED = {
  partial: 'status.eq.PARTIAL_MATCH',
  no_match: 'status.eq.NO_MATCH',
  anomaly: 'anomaly_flag.eq.true',
};

async function flaggedTransactions(db: Db, { filter }: z.output<typeof flaggedInput>) {
  const { data, count } = throwOn(
    await db
      .from('matches')
      .select(
        'status, score, anomaly_flag, anomaly_reason, invoices!inner(invoice_number, vendor_name, total_amount, imported_history)',
        { count: 'exact' },
      )
      .eq('review_status', 'PENDING_REVIEW')
      .eq('invoices.imported_history', false)
      .or(filter ? FLAGGED[filter] : Object.values(FLAGGED).join(','))
      .order('created_at', { ascending: false })
      .limit(MAX_FLAGGED_ROWS),
  );
  return {
    count: count ?? 0,
    transactions: (data ?? []).map(({ invoices, ...match }) => ({
      ...match,
      invoice_number: invoices.invoice_number,
      vendor_name: invoices.vendor_name,
      total_amount_text: invoices.total_amount === null ? null : rupiah(invoices.total_amount),
    })),
  };
}

async function documentDetail(db: Db, { document_id }: z.output<typeof documentDetailInput>) {
  const [{ data: document }, { data: extraction }] = await Promise.all([
    db.from('documents').select('original_filename, status').eq('id', document_id).maybeSingle().then(throwOn),
    db.from('extractions').select('fields').eq('document_id', document_id).maybeSingle().then(throwOn),
  ]);
  if (!document) return { found: false };

  const fields = (extraction?.fields ?? {}) as unknown as Partial<CheckedInvoice>;
  return {
    found: true,
    ...document,
    fields: Object.fromEntries(
      Object.entries(fields)
        .filter(([name]) => name !== 'line_items')
        .map(([name, field]) => {
          const { value, confidence, verification } = field as CheckedInvoice['npwp'];
          return [name, { value, confidence, verification }];
        }),
    ),
  };
}

/** The whole tool set. All four read, under the caller's session (D8). */
export function chatTools(db: Db): LlmTool[] {
  return [
    defineTool({
      name: 'get_vendor_total',
      description:
        'Total of PAID invoices for a vendor, optionally between two payment dates (YYYY-MM-DD). Quote total_amount_text.',
      inputSchema: vendorTotalInput,
      execute: (input) => vendorTotal(db, input),
    }),
    defineTool({
      name: 'check_invoice_status',
      description: 'Document, match and review status of an invoice, by its number.',
      inputSchema: invoiceStatusInput,
      execute: (input) => invoiceStatus(db, input),
    }),
    defineTool({
      name: 'list_flagged_transactions',
      description: 'PARTIAL_MATCH, NO_MATCH and anomaly-flagged invoices still waiting for review.',
      inputSchema: flaggedInput,
      execute: (input) => flaggedTransactions(db, input),
    }),
    defineTool({
      name: 'get_document_detail',
      description: 'Extracted fields of a document, with confidence and verification, by document id.',
      inputSchema: documentDetailInput,
      execute: (input) => documentDetail(db, input),
    }),
  ];
}
