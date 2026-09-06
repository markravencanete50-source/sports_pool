import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { isUuid, notFound } from "@/lib/admin/helpers";

/**
 * One user, for /admin/users/[id]: account, compliance, financial summary,
 * pool involvement and the payment history — which is the user's ledger
 * (entry fees, winnings credits, withdrawals), not an activity log.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "users.view" });
    if (auth instanceof NextResponse) return auth;

    const { userId } = await params;
    if (!isUuid(userId)) return notFound("User not found");

    const admin = createAdminClient();
    const [{ data: user }, { data: compliance }] = await Promise.all([
      admin
        .from("users")
        .select(
          "id, email, name, avatar, role, admin_role, admin_note, account_status, status_reason, status_changed_at, status_changed_by, suspended_until, balance, created_at, updated_at, last_active_at"
        )
        .eq("id", userId)
        .maybeSingle(),
      admin.from("user_compliance").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    if (!user) return notFound("User not found");

    const [
      { data: createdPools },
      { data: joinedRows },
      { data: cards },
      { data: entries },
      { data: ledger },
      { data: withdrawals },
      { data: payoutAccount },
      { data: winners },
    ] = await Promise.all([
      admin.from("pools").select("id, name, status, type, entry_fee, created_at").eq("created_by", userId).order("created_at", { ascending: false }).limit(50),
      admin.from("pool_participants").select("pool_id, pools(id, name, status, type, entry_fee)").eq("user_id", userId).limit(100),
      admin.from("parlay_cards").select("id, pool_id, status, entry_fee_paid, created_at").eq("user_id", userId).limit(200),
      admin
        .from("pool_transactions")
        .select("id, pool_id, card_id, amount, platform_fee, net_amount, status, payment_provider, stripe_session_id, payment_id, refund_status, refunded_at, created_at, pools(name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("user_transactions")
        .select("id, pool_id, amount, previous_balance, final_balance, type, reference_type, reference_id, comment, created_at, pools(name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("payout_requests")
        .select("id, pool_id, amount, status, provider, provider_reference, stripe_transfer_id, failure_reason, review_reason, created_at, processed_at, reviewed_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      admin.from("user_payout_accounts").select("method, identifier, updated_at").eq("user_id", userId).maybeSingle(),
      admin.from("pool_winners").select("pool_id, amount, correct, total, created_at, pools(name)").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    ]);

    const sum = (rows: Array<{ amount?: unknown }> | null | undefined, filter?: (r: Record<string, unknown>) => boolean) =>
      (rows ?? []).reduce((acc, r) => (!filter || filter(r as Record<string, unknown>) ? acc + Number(r.amount ?? 0) : acc), 0);

    const joinedPools = (joinedRows ?? []).map((r: Record<string, unknown>) => r.pools).filter(Boolean);
    const activeStatuses = new Set(["open", "active", "paused"]);

    const summary = {
      balance: Number(user.balance ?? 0),
      totalDeposits: sum(entries, (r) => r.status === "completed" && r.refund_status !== "refunded"),
      totalEntryFees: sum(entries, (r) => r.status === "completed"),
      totalWinnings: sum(ledger, (r) => r.type === "winning_approved"),
      totalWithdrawals: sum(withdrawals, (r) => r.status === "completed"),
      pendingWithdrawals: sum(withdrawals, (r) => ["pending", "approved", "on_hold", "processing"].includes(String(r.status))),
      poolsCreated: createdPools?.length ?? 0,
      poolsJoined: joinedPools.length,
      activePools: joinedPools.filter((p) => activeStatuses.has(String((p as Record<string, unknown>).status))).length,
      completedPools: joinedPools.filter((p) => String((p as Record<string, unknown>).status) === "completed").length,
      cards: cards?.length ?? 0,
    };

    // Unified payment history, newest first.
    const history = [
      ...(entries ?? []).map((t: Record<string, unknown>) => ({
        id: t.id,
        kind: "entry_fee",
        amount: -Number(t.amount),
        provider: t.payment_provider ?? "stripe",
        status: t.refund_status === "refunded" ? "refunded" : t.refund_status === "refund_required" ? "refund_required" : t.status,
        reference: t.stripe_session_id ?? t.payment_id,
        pool: (t.pools as { name?: string } | null)?.name ?? null,
        poolId: t.pool_id,
        cardId: t.card_id,
        date: t.created_at,
        href: `/admin/finance/transactions/${t.id}`,
      })),
      ...(ledger ?? []).map((t: Record<string, unknown>) => ({
        id: t.id,
        kind: t.type,
        amount: Number(t.amount),
        provider: "balance",
        status: "completed",
        reference: t.reference_id,
        pool: (t.pools as { name?: string } | null)?.name ?? null,
        poolId: t.pool_id,
        cardId: null,
        date: t.created_at,
        href: null,
        note: t.comment,
      })),
      ...(withdrawals ?? []).map((w: Record<string, unknown>) => ({
        id: w.id,
        kind: "withdrawal",
        amount: -Number(w.amount),
        provider: w.provider ?? "paypal",
        status: w.status,
        reference: w.provider_reference ?? w.stripe_transfer_id,
        pool: null,
        poolId: w.pool_id,
        cardId: null,
        date: w.created_at,
        href: `/admin/finance/withdrawals?id=${w.id}`,
        note: w.failure_reason ?? w.review_reason ?? null,
      })),
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

    return NextResponse.json(
      {
        user,
        compliance,
        payoutAccount,
        summary,
        pools: { created: createdPools ?? [], joined: joinedPools },
        winners: winners ?? [],
        history,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
