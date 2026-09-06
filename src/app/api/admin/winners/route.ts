import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { isUuid, paged, parsePagination } from "@/lib/admin/helpers";

/**
 * Winners across completed pools with their payout state: whether the
 * credit was claimed into balance (payout_approvals) and whether any
 * withdrawal of it has since been requested or paid (payout_requests).
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "winners.view" });
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const poolId = searchParams.get("poolId");
    const { page, limit, from, to } = parsePagination(searchParams);
    const admin = createAdminClient();

    let query = admin
      .from("pool_winners")
      .select(
        "id, pool_id, user_id, winning_card_id, correct, total, amount, total_score_diff, approved_at, created_at, " +
          "pools(id, name, status, entry_fee, platform_fee_percentage), users!pool_winners_user_id_fkey(id, name)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });
    if (isUuid(poolId)) query = query.eq("pool_id", poolId);

    const { data: raw, count, error } = await query.range(from, to);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const data = (raw ?? []) as unknown as Array<Record<string, unknown>>;

    const poolIds = [...new Set(data.map((w) => w.pool_id as string))];
    const [{ data: approvals }, { data: withdrawals }, { data: siblings }] = await Promise.all([
      poolIds.length ? admin.from("payout_approvals").select("pool_id, user_id, status, claimed_at").in("pool_id", poolIds) : Promise.resolve({ data: [] }),
      poolIds.length ? admin.from("payout_requests").select("pool_id, user_id, status, amount").in("pool_id", poolIds) : Promise.resolve({ data: [] }),
      poolIds.length ? admin.from("pool_winners").select("pool_id").in("pool_id", poolIds) : Promise.resolve({ data: [] }),
    ]);
    const key = (r: { pool_id: string; user_id: string }) => `${r.pool_id}:${r.user_id}`;
    const approvalByKey = new Map((approvals ?? []).map((a: { pool_id: string; user_id: string }) => [key(a), a]));
    const withdrawalsByKey = new Map<string, Array<Record<string, unknown>>>();
    for (const w of (withdrawals ?? []) as Array<{ pool_id: string; user_id: string }>) {
      const k = key(w);
      withdrawalsByKey.set(k, [...(withdrawalsByKey.get(k) ?? []), w]);
    }
    const winnersPerPool = new Map<string, number>();
    for (const s of (siblings ?? []) as Array<{ pool_id: string }>) {
      winnersPerPool.set(s.pool_id, (winnersPerPool.get(s.pool_id) ?? 0) + 1);
    }

    const rows = data.map((w) => {
      const k = key(w as { pool_id: string; user_id: string });
      const approval = approvalByKey.get(k) as { status?: string; claimed_at?: string } | undefined;
      const wds = withdrawalsByKey.get(k) ?? [];
      const paidOut = wds.some((x) => x.status === "completed");
      return {
        ...w,
        pool: w.pools,
        user: w.users,
        pools: undefined,
        users: undefined,
        tie: (winnersPerPool.get(w.pool_id as string) ?? 1) > 1,
        payout_status: paidOut
          ? "withdrawn"
          : wds.some((x) => ["pending", "approved", "processing", "on_hold"].includes(String(x.status)))
            ? "withdrawal_pending"
            : approval?.status === "claimed"
              ? "credited"
              : approval?.status === "pending_claim"
                ? "pending_claim"
                : "unpaid",
      };
    });

    const result = paged(rows, count, page, limit);
    return NextResponse.json({ winners: result.rows, ...result }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
