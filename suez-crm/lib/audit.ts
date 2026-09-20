import { sql } from "./db";

/** Fire-and-forget audit trail. Never let logging break the action. */
export async function audit(
  userId: number | null,
  action: string,
  entity?: string,
  entityId?: string | number,
  meta: Record<string, unknown> = {},
) {
  try {
    await sql`
      insert into audit_log (user_id, action, entity, entity_id, meta)
      values (${userId}, ${action}, ${entity ?? null}, ${entityId?.toString() ?? null}, ${JSON.stringify(meta)}::jsonb)`;
  } catch (e) {
    console.error("audit failed", action, e);
  }
}

/**
 * Re-exported so the call sites that already say
 * `import { audit, notify } from "@/lib/audit"` keep working, and pick up email
 * delivery without being touched. New code should import it from lib/notify.
 */
export { notify, usersWithCapability } from "./notify";
