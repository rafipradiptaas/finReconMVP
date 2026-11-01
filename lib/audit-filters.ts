import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/types/database.types';

const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

const filters = z.object({
  entity_type: optional(z.string().trim().min(1)),
  entity_id: optional(z.uuid()),
  action: optional(z.string().trim().min(1)),
  from: optional(z.iso.date()),
  to: optional(z.iso.date()),
});

export type AuditFilters = z.output<typeof filters>;

/** A value that is not valid is ignored, as if the filter were empty. */
export const parseAuditFilters = (params: Record<string, unknown>): AuditFilters => filters.parse(params);

const WIB = '+07:00';
export const AUDIT_COLUMNS =
  'id, created_at, actor_user_id, actor_role, entity_type, entity_id, action, old_value, new_value, reason';

/** Read with the caller's client, so RLS keeps it to their organization. Dates are WIB. */
export function auditQuery(db: SupabaseClient<Database>, { entity_type, entity_id, action, from, to }: AuditFilters) {
  let query = db
    .from('audit_logs')
    .select(AUDIT_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id');
  if (entity_type) query = query.eq('entity_type', entity_type);
  if (entity_id) query = query.eq('entity_id', entity_id);
  if (action) query = query.eq('action', action);
  if (from) query = query.gte('created_at', `${from}T00:00:00${WIB}`);
  if (to) query = query.lte('created_at', `${to}T23:59:59.999${WIB}`);
  return query;
}
