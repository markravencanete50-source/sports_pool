import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin, requireReason } from "@/lib/require-admin";
import { recordAdminAction } from "@/lib/compliance/audit";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isUuid, notFound } from "@/lib/admin/helpers";
import { materializePoolWinners } from "@/lib/materialize-winners";
import { logEvent } from "@/lib/log";

/**
 * Recalculate a settled pool's winners — the financial override.
 *
 * Order matters and is atomic where it must be:
 *   1. admin_reverse_pool_settlement() pulls every credit back into the
 *      ledger in ONE transaction, or refuses (a winner already withdrew, a
 *      balance is short). Nothing else happens if it refuses.
 *   2. materializePoolWinners() re-scores from the current game results and
 *      credits the new winners.
 * Both halves are recorded in the audit log with the reason. Second factor
 * required: this moves money.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:pool-recalculate", RATE_LIMITS.adminAction);
    if (limited) return limited;

    const { poolId } = await params;
    if (!isUuid(poolId)) return notFound("Pool not found");

    const body = await request.json().catch(() => ({}));
    const reasonCheck = requireReason(body);
    if (reasonCheck instanceof NextResponse) return reasonCheck;
    const { reason } = reasonCheck;

    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "winners.recalculate", requireMfa: true });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data: pool } = await admin.from("pools").select("id, status").eq("id", poolId).maybeSingle();
    if (!pool) return notFound("Pool not found");
    if (pool.status !== "completed") {
      return NextResponse.json({ error: "Only a completed pool can be recalculated" }, { status: 400 });
    }

    const { data: before } = await admin
      .from("pool_winners")
      .select("user_id, amount, correct, total")
      .eq("pool_id", poolId);

    const { data: reversal, error: reverseError } = await admin.rpc("admin_reverse_pool_settlement", {
      p_pool_id: poolId,
      p_actor: auth.user.id,
      p_reason: reason,
    });
    if (reverseError) {
      logEvent("warn", "admin.recalculate_refused", { poolId, reason: reverseError.message });
      return NextResponse.json(
        { error: `Reversal refused: ${reverseError.message.replace(/^.*?:\s*/, "")}` },
        { status: 409 }
      );
    }

    const { count } = await materializePoolWinners(admin, poolId);
    const { data: after } = await admin
      .from("pool_winners")
      .select("user_id, amount, correct, total")
      .eq("pool_id", poolId);

    await recordAdminAction({
      actorId: auth.user.id,
      action: "pool.recalculate_winners",
      targetType: "pool",
      targetId: poolId,
      before: { winners: before ?? [] },
      after: { reversal, winners: after ?? [], winnersCreated: count },
      reason,
    });

    return NextResponse.json(
      { reversal, winnersCreated: count, winners: after ?? [] },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
