import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin, requireReason } from "@/lib/require-admin";
import { recordAdminAction } from "@/lib/compliance/audit";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isUuid, badRequest, notFound } from "@/lib/admin/helpers";
import { materializePoolWinners } from "@/lib/materialize-winners";
import { z } from "zod";

/**
 * Pool overrides: pause / resume / cancel / complete / reopen.
 *
 * Transitions are explicit and refuse anything that would move money
 * without the ledger agreeing:
 *   pause     open|active → paused              (no purchases, no settlement)
 *   resume    paused → open|active
 *   cancel    open|active|paused → cancelled    (no winners may exist; paid
 *             entries are marked refund_required for Finance → Refunds)
 *   complete  open|active|paused → completed    (forces completion, then runs
 *             the normal winner calculation)
 *   reopen    completed|cancelled → open|active (refused if winners were
 *             credited or refunds recorded)
 * cancel / complete / reopen require a second factor.
 */
const bodySchema = z.object({
  action: z.enum(["pause", "resume", "cancel", "complete", "reopen"]),
  reason: z.string().trim().min(5).max(1000),
});

const PERMISSION_FOR = {
  pause: "pools.pause",
  resume: "pools.pause",
  cancel: "pools.cancel",
  complete: "pools.complete",
  reopen: "pools.reopen",
} as const;

const MFA_ACTIONS = new Set(["cancel", "complete", "reopen"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:pool-status", RATE_LIMITS.adminAction);
    if (limited) return limited;

    const { poolId } = await params;
    if (!isUuid(poolId)) return notFound("Pool not found");

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
    const reasonCheck = requireReason(body);
    if (reasonCheck instanceof NextResponse) return reasonCheck;
    const { action } = parsed.data;
    const { reason } = reasonCheck;

    const supabase = await createClient();
    const auth = await requireAdmin(supabase, {
      permission: PERMISSION_FOR[action],
      requireMfa: MFA_ACTIONS.has(action),
    });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data: pool } = await admin
      .from("pools")
      .select("id, name, status, status_reason")
      .eq("id", poolId)
      .maybeSingle();
    if (!pool) return notFound("Pool not found");

    const [{ count: winnerCount }, { count: creditCount }, { count: activeCards }, { count: refundedCount }] =
      await Promise.all([
        admin.from("pool_winners").select("id", { count: "exact", head: true }).eq("pool_id", poolId),
        admin.from("user_transactions").select("id", { count: "exact", head: true }).eq("pool_id", poolId).eq("type", "winning_approved"),
        admin.from("parlay_cards").select("id", { count: "exact", head: true }).eq("pool_id", poolId).in("status", ["active", "completed"]),
        admin.from("pool_transactions").select("id", { count: "exact", head: true }).eq("pool_id", poolId).eq("refund_status", "refunded"),
      ]);

    const from = pool.status as string;
    let to: string;
    const extra: Record<string, unknown> = {};

    switch (action) {
      case "pause":
        if (!["open", "active"].includes(from)) return badRequest(`A ${from} pool cannot be paused`);
        to = "paused";
        break;
      case "resume":
        if (from !== "paused") return badRequest("Only a paused pool can be resumed");
        to = (activeCards ?? 0) > 0 ? "active" : "open";
        break;
      case "cancel":
        if (!["open", "active", "paused"].includes(from)) return badRequest(`A ${from} pool cannot be cancelled`);
        if ((winnerCount ?? 0) > 0 || (creditCount ?? 0) > 0) {
          return badRequest("This pool has been settled; reverse the settlement before cancelling.");
        }
        to = "cancelled";
        break;
      case "complete":
        if (!["open", "active", "paused"].includes(from)) return badRequest(`A ${from} pool cannot be completed`);
        to = "completed";
        break;
      case "reopen":
        if (!["completed", "cancelled"].includes(from)) return badRequest("Only a completed or cancelled pool can be reopened");
        if ((winnerCount ?? 0) > 0 || (creditCount ?? 0) > 0) {
          return badRequest("This pool has winners on record; reverse the settlement before reopening.");
        }
        if ((refundedCount ?? 0) > 0) {
          return badRequest("Entries on this pool have been refunded; it cannot be reopened.");
        }
        to = (activeCards ?? 0) > 0 ? "active" : "open";
        break;
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from("pools")
      .update({ status: to, status_reason: reason, status_changed_at: now, status_changed_by: auth.user.id })
      .eq("id", poolId)
      .eq("status", from); // optimistic: refuse if someone else moved it first
    if (error) return NextResponse.json({ error: "Could not update the pool" }, { status: 500 });

    if (action === "cancel") {
      // Money that came in must go back. Mark every completed entry for a
      // refund; the actual Stripe refund is performed and recorded from
      // Finance → Refunds. Cards are cancelled so nothing scores.
      const { data: marked } = await admin
        .from("pool_transactions")
        .update({ refund_status: "refund_required", refund_reason: reason })
        .eq("pool_id", poolId)
        .eq("status", "completed")
        .eq("refund_status", "none")
        .select("id");
      await admin.from("parlay_cards").update({ status: "cancelled" }).eq("pool_id", poolId).in("status", ["pending", "active"]);
      extra.refundsRequired = marked?.length ?? 0;
    }

    if (action === "complete") {
      // Same path the cron takes once a slate is final. Refuses to pay twice.
      const { count } = await materializePoolWinners(admin, poolId);
      extra.winnersCreated = count;
    }

    if (action === "reopen" && from === "cancelled") {
      await admin
        .from("pool_transactions")
        .update({ refund_status: "none", refund_reason: null })
        .eq("pool_id", poolId)
        .eq("refund_status", "refund_required");
      await admin.from("parlay_cards").update({ status: "pending" }).eq("pool_id", poolId).eq("status", "cancelled");
    }

    await recordAdminAction({
      actorId: auth.user.id,
      action: `pool.${action}`,
      targetType: "pool",
      targetId: poolId,
      before: { status: from, status_reason: pool.status_reason },
      after: { status: to, ...extra },
      reason,
    });

    return NextResponse.json({ pool: { id: poolId, status: to }, ...extra }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
