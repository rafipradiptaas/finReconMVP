import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CheckedInvoice } from '@/lib/extraction-checks';
import type { ScoreBreakdown } from '@/lib/matching';
import { requiredReviewItems, type ReviewMatch } from '@/lib/review';
import type { WriteContext } from '@/lib/server/write-context';
import type { Database } from '@/types/database.types';
import { isMatchingFailed } from '@/types/domain';

/**
 * Everything a review decision depends on, loaded the same way for the API
 * (service role) and the panel (RLS). organizationId comes from the session.
 */
export async function loadReview(db: SupabaseClient<Database>, organizationId: string, matchId: string) {
  const { data: match, error } = await db
    .from('matches')
    .select('*, invoices!inner(*, documents(id, uploaded_by, status_message, storage_path, original_filename))')
    .eq('id', matchId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!match) return null;

  const { invoices: invoice, ...row } = match;
  const document = invoice.documents;
  const [{ data: extraction, error: extractionError }, { data: twins, error: twinError }] = await Promise.all([
    invoice.document_id
      ? db
          .from('extractions')
          .select('fields')
          .eq('document_id', invoice.document_id)
          .eq('organization_id', organizationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    invoice.vendor_id && invoice.invoice_number_normalized
      ? db
          .from('invoices')
          .select('matches(review_status)')
          .eq('organization_id', organizationId)
          .eq('vendor_id', invoice.vendor_id)
          .eq('invoice_number_normalized', invoice.invoice_number_normalized)
          .neq('id', invoice.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (extractionError) throw extractionError;
  if (twinError) throw twinError;

  const fields = (extraction?.fields ?? null) as unknown as CheckedInvoice | null;
  const reviewMatch: ReviewMatch = {
    status: row.status,
    review_status: row.review_status,
    anomaly_flag: row.anomaly_flag,
    score_breakdown: row.score_breakdown as unknown as ScoreBreakdown | null,
  };
  const twinStatuses = (twins ?? []).map((twin) => twin.matches?.review_status);

  return {
    match: row,
    reviewMatch,
    invoice,
    document,
    fields,
    uploadedBy: document?.uploaded_by ?? null,
    matchingFailed: isMatchingFailed(document?.status_message),
    requiredItems: requiredReviewItems(reviewMatch, invoice, fields && { fields }),
    pendingTwin: twinStatuses.includes('PENDING_REVIEW'),
    duplicateDecided: twinStatuses.includes('APPROVED') || twinStatuses.includes('PAID'),
  };
}

/**
 * The reviewer's open session on this match, opened now if there is none.
 * ponytail: check-then-insert, so two simultaneous requests can open two rows.
 * Add a partial unique index if the review metrics ever need exact counts.
 */
export async function openReviewSession({ db, organizationId, userId }: WriteContext, matchId: string) {
  const { data: open, error } = await db
    .from('review_sessions')
    .select('id, opened_at')
    .eq('organization_id', organizationId)
    .eq('match_id', matchId)
    .eq('reviewer_id', userId)
    .is('decided_at', null)
    .order('opened_at')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (open) return open;

  const { data, error: insertError } = await db
    .from('review_sessions')
    .insert({ organization_id: organizationId, match_id: matchId, reviewer_id: userId })
    .select('id, opened_at')
    .single();
  if (insertError) throw insertError;
  return data;
}
