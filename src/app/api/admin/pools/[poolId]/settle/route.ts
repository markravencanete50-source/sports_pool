import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin, requireReason } from "@/lib/require-admin";
import { recordAdminAction } from "@/lib/compliance/audit";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isUuid, notFound } from "@/lib/admin/helpers";
import { completePoolIfAllGamesFinished } from "@/lib/pool-completion";
import { materializePoolWinners } from "@/lib/materialize-winners";
import { refreshGameScores } from "@/lib/settle-pools";

/**
 * "Trigger winner calculation" for ONE pool, exactly as the cron would:
 * refresh scores, complete the pool if its slate is final, then materialise
 * winners. Refuses nothing the cron would allow and allows nothing it would
 * refuse — it is the same code, run now, with an audit row.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:pool-settle", RATE_LIMITS.adminAction);
    if (limited) return limited;

    const { poolId } = await params;
    if (!isUuid(poolId)) return notFound("Pool not found");

    const body = await request.json().catch(() => ({}));
    const reasonCheck = requireReason(body, 3);
    if (reasonCheck instanceof NextResponse) return reasonCheck;

    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "pools.complete" });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data: pool } = await admin.from("pools").select("id, status").eq("id", poolId).maybeSingle();
    if (!pool) return notFound("Pool not found");
    if (pool.status === "cancelled" || pool.status === "paused") {
      return NextResponse.json({ error: `A ${pool.status} pool cannot be settled` }, { status: 400 });
    }

    const scores = await refreshGameScores(admin);
    let completed = pool.status === "completed";
    if (!completed) completed = await completePoolIfAllGamesFinished(admin, poolId);

    let winnersCreated = 0;
    if (completed) {
      const { count } = await materializePoolWinners(admin, poolId);
      winnersCreated = count;
    }

    await recordAdminAction({
      actorId: auth.user.id,
      action: "pool.settle",
      targetType: "pool",
      targetId: poolId,
      before: { status: pool.status },
      after: { completed, winnersCreated, gamesUpdated: scores.updated },
      reason: reasonCheck.reason,
    });

    return NextResponse.json(
      {
        completed,
        winnersCreated,
        gamesChecked: scores.checked,
        gamesUpdated: scores.updated,
        warnings: scores.warnings,
        note: completed
          ? winnersCreated > 0
            ? "Winners calculated and credited."
            : "Pool is complete; no new winners were created (already settled, or no scoring card)."
          : "Not every game in this pool is final yet; nothing was settled.",
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
