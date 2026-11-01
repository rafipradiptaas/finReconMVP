import { z } from 'zod';

/**
 * What the model may ask for. organization_id is on none of these: the client
 * passed to the tools carries the user's session, and RLS scopes every read.
 */
export const vendorTotalInput = z.object({
  vendor_name: z.string().trim().min(1),
  period_start: z.iso.date().optional(),
  period_end: z.iso.date().optional(),
});

export const invoiceStatusInput = z.object({ invoice_number: z.string().trim().min(1) });

export const flaggedInput = z.object({ filter: z.enum(['partial', 'no_match', 'anomaly']).optional() });

export const documentDetailInput = z.object({ document_id: z.uuid() });
