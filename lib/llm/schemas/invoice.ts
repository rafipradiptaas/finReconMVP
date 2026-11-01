import { z } from 'zod';

const confidence = z.enum(['high', 'medium', 'low']);

// source_text is a plain string on the wire ("" = none): the API allows 16
// union-typed parameters per request, and one nullable per field would be 22.
const field = <Value extends z.ZodType>(value: Value) =>
  z.object({ value: value.nullable(), confidence, source_text: z.string() });

/** The extractor's output (product doc 6.2). Zod checks it even though the API constrains it. */
export const invoiceExtractionSchema = z.object({
  invoice_number: field(z.string()),
  invoice_date: field(z.string()),
  vendor_name: field(z.string()),
  npwp: field(z.string()),
  po_number: field(z.string()),
  bank_name: field(z.string()),
  bank_account_number: field(z.string()),
  bank_account_holder: field(z.string()),
  subtotal: field(z.number()),
  tax_amount: field(z.number()),
  total_amount: field(z.number()),
  line_items: z.array(
    z.object({
      value: z.object({
        description: z.string(),
        quantity: z.number(),
        unit_price: z.number(),
        line_subtotal: z.number(),
      }),
      confidence,
      source_text: z.string(),
    }),
  ),
});

export type InvoiceExtraction = z.output<typeof invoiceExtractionSchema>;
