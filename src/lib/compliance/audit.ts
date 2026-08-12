import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/log";

/**
 * Attributable trail for privileged actions — audit item 9.B.
 *
 * Financial disputes are resolved from a record of who did what, not from
 * recollection. Role changes, payout completions, platform-fee edits and KYC
 * decisions all land here.
 *
 * Best-effort by design: a failure to write the audit row must not roll back
 * the action it describes, because half-applying a payout is worse than an
 * incomplete log. The failure itself is logged loudly so the gap is visible.
 */
export async function recordAdminAction(input: {
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    const { error } = await createAdminClient().from("admin_audit_log").insert({
      actor_id: input.actorId,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      before_state: input.before ?? null,
      after_state: input.after ?? null,
    });
    if (error) {
      logEvent("error", "admin_audit.insert_failed", {
        action: input.action,
        reason: error.message,
      });
    }
  } catch (err) {
    logEvent("error", "admin_audit.insert_threw", {
      action: input.action,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}
