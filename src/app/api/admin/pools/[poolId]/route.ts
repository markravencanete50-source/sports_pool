import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getPoolFinancials } from "@/lib/pool-financials";
import { isUuid, notFound } from "@/lib/admin/helpers";

/** One pool for /admin/pools/[id]: everything an operator needs to act on it. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "pools.view" });
    if (auth instanceof NextResponse) return auth;

    const { poolId } = await params;
    if (!isUuid(poolId)) return notFound("Pool not found");
    const admin = createAdminClient();

    const { data: pool } = await admin
      .from("pools")
      .select(
        "*, owner:profiles!pools_created_by_profiles_fkey(id, name), pool_games(game_id, games(*))"
      )
      .eq("id", poolId)
      .maybeSingle();
    if (!pool) return notFound("Pool not found");

    const [
      financials,
      { data: ownerUser },
      { data: participants },
      { data: cards },
      { data: winners },
      { data: approvals },
      { data: transactions },
      { data: withdrawals },
      { data: promotions },
      { data: audit },
    ] = await Promise.all([
      getPoolFinancials(admin, poolId),
      admin.from("users").select("id, email, account_status").eq("id", pool.created_by).maybeSingle(),
      admin.from("pool_participants").select("user_id, created_at, users:profiles!pool_participants_user_id_profiles_fkey(id, name, avatar)").eq("pool_id", poolId),
      admin.from("parlay_cards").select("id, user_id, card_number, status, entry_fee_paid, created_at").eq("pool_id", poolId).order("created_at"),
      admin.from("pool_winners").select("id, user_id, winning_card_id, correct, total, amount, total_score_diff, approved_at, created_at, users!pool_winners_user_id_fkey(name)").eq("pool_id", poolId),
      admin.from("payout_approvals").select("id, user_id, amount, status, approved_at, claimed_at").eq("pool_id", poolId),
      admin.from("pool_transactions").select("id, user_id, card_id, amount, platform_fee, net_amount, status, payment_provider, stripe_session_id, payment_id, refund_status, refunded_at, created_at").eq("pool_id", poolId).order("created_at", { ascending: false }),
      admin.from("payout_requests").select("id, user_id, amount, status, provider, created_at, processed_at").eq("pool_id", poolId),
      admin.from("pool_promotions").select("id, status, placement, amount, starts_at, ends_at, review_note, created_at").eq("pool_id", poolId).order("created_at", { ascending: false }),
      admin.from("admin_audit_log").select("id, actor_id, action, reason, before_state, after_state, created_at").eq("target_type", "pool").eq("target_id", poolId).order("created_at", { ascending: false }).limit(50),
    ]);

    const userIds = new Set<string>();
    for (const c of cards ?? []) userIds.add(c.user_id as string);
    for (const t of transactions ?? []) userIds.add(t.user_id as string);
    const { data: people } = userIds.size
      ? await admin.from("users").select("id, email, name").in("id", [...userIds])
      : { data: [] as Array<Record<string, unknown>> };
    const personById = new Map((people ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));

    const { access_password_hash: _omit, ...publicPool } = pool as Record<string, unknown> & { access_password_hash?: string | null };
    void _omit;

    return NextResponse.json(
      {
        pool: {
          ...publicPool,
          requires_password: Boolean(pool.access_password_hash),
          owner: { ...(pool.owner as object), email: ownerUser?.email ?? null, account_status: ownerUser?.account_status ?? null },
          prize_pot: financials.prize_pot,
          paid_participants: financials.paid_participant_count,
          platform_fee: Number(((financials.prize_pot ?? 0) * Number(pool.platform_fee_percentage ?? 10)) / 100),
        },
        participants: participants ?? [],
        cards: (cards ?? []).map((c: Record<string, unknown>) => ({ ...c, user: personById.get(c.user_id as string) ?? null })),
        winners: winners ?? [],
        payoutApprovals: approvals ?? [],
        transactions: (transactions ?? []).map((t: Record<string, unknown>) => ({ ...t, user: personById.get(t.user_id as string) ?? null })),
        withdrawals: withdrawals ?? [],
        promotions: promotions ?? [],
        audit: audit ?? [],
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
