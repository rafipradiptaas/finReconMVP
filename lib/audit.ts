import 'server-only';
import { getSessionContext, type SessionContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database.types';

export type AuditEntry = {
  entityType: string;
  entityId?: string | null;
  action: string;
  oldValue?: Json;
  newValue?: Json;
  reason?: string | null;
};

/**
 * Appends to audit_logs. organization_id, actor_user_id and actor_role always
 * come from the session. Throws on failure: a state change that cannot be
 * audited must surface as an error, never pass silently.
 *
 * Pass the session when the caller already has it (and an array for a batch)
 * to avoid one profile lookup per row.
 */
export async function logAudit(entry: AuditEntry | AuditEntry[], session?: SessionContext) {
  const actor = session ?? (await getSessionContext());
  if (!actor) throw new Error('logAudit requires a session');

  const entries = Array.isArray(entry) ? entry : [entry];
  if (entries.length === 0) return;

  const { error } = await createAdminClient()
    .from('audit_logs')
    .insert(
      entries.map((e) => ({
        organization_id: actor.organizationId,
        actor_user_id: actor.userId,
        actor_role: actor.role,
        entity_type: e.entityType,
        entity_id: e.entityId ?? null,
        action: e.action,
        old_value: e.oldValue ?? null,
        new_value: e.newValue ?? null,
        reason: e.reason ?? null,
      })),
    );
  if (error) throw new Error(`audit_logs insert failed: ${error.message}`);
}
