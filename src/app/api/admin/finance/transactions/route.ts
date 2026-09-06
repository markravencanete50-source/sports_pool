import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { isUuid, paged, parseDateRange, parsePagination } from "@/lib/admin/helpers";

/**
 * The financial ledger, unified across the three tables that already hold it:
 *   pool_transactions  → entry fees / deposits (Stripe), and refunds of them
 *   user_transactions  → balance movements: winnings credited, payouts debited,
 *                        settlement reversals
 *   payout_requests    → withdrawals and their provider outcome
 * No new table: this is a read model over the existing structures.
 *
 * type=all|deposits|entry_fees|withdrawals|payouts|refunds|failed|winnings
 * status=..., provider=..., userId=, poolId=, from=, to=
 */
type Row = {
  id: string;
  source: "pool_transactions" | "user_transactions" | "payout_requests";
  kind: string;
  amount: number;
  provider: string;
  status: string;
  reference: string | null;
  userId: string | null;
  poolId: string | null;
  cardId: string | null;
  failureReason: string | null;
  date: string;
};

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "transactions.view" });
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "all";
    const status = searchParams.get("status");
    const provider = searchParams.get("provider");
    const userId = searchParams.get("userId");
    const poolId = searchParams.get("poolId");
    const { from: dateFrom, to: dateTo } = parseDateRange(searchParams);
    const { page, limit } = parsePagination(searchParams);
    const admin = createAdminClient();

    // Pull a bounded window from each source, merge, sort, then page. The
    // window is generous relative to a page and filtered server-side, so
    // paging stays correct without a SQL UNION.
    const WINDOW = 400;
    const wantEntries = ["all", "deposits", "entry_fees", "refunds", "failed"].includes(type);
    const wantLedger = ["all", "payouts", "winnings", "failed"].includes(type);
    const wantWithdrawals = ["all", "withdrawals", "payouts", "failed"].includes(type);

    const scoped = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T; eq: (c: string, v: string) => T }>(q: T) => {
      let out = q;
      if (dateFrom) out = out.gte("created_at", dateFrom);
      if (dateTo) out = out.lte("created_at", dateTo);
      if (isUuid(userId)) out = out.eq("user_id", userId);
      if (isUuid(poolId)) out = out.eq("pool_id", poolId);
      return out;
    };

    const [entries, ledger, withdrawals] = await Promise.all([
      wantEntries
        ? scoped(
            admin
              .from("pool_transactions")
              .select("id, user_id, pool_id, card_id, amount, status, payment_provider, stripe_session_id, payment_id, refund_status, refund_reference, refunded_at, refund_reason, created_at")
              .order("created_at", { ascending: false })
              .limit(WINDOW)
          )
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      wantLedger
        ? scoped(
            admin
              .from("user_transactions")
              .select("id, user_id, pool_id, amount, type, reference_type, reference_id, comment, created_at")
              .order("created_at", { ascending: false })
              .limit(WINDOW)
          )
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      wantWithdrawals
        ? scoped(
            admin
              .from("payout_requests")
              .select("id, user_id, pool_id, amount, status, provider, provider_reference, stripe_transfer_id, failure_reason, review_reason, created_at, processed_at")
              .order("created_at", { ascending: false })
              .limit(WINDOW)
          )
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);

    let rows: Row[] = [
      ...((entries.data ?? []) as Array<Record<string, unknown>>).map((t) => ({
        id: t.id as string,
        source: "pool_transactions" as const,
        kind: t.refund_status === "refunded" ? "refund" : t.refund_status === "refund_required" ? "refund_required" : "entry_fee",
        amount: t.refund_status === "refunded" ? -Number(t.amount) : Number(t.amount),
        provider: (t.payment_provider as string) ?? "stripe",
        status: t.refund_status === "refunded" ? "refunded" : t.refund_status === "refund_required" ? "refund_required" : (t.status as string),
        reference: (t.stripe_session_id as string) ?? (t.payment_id as string) ?? null,
        userId: t.user_id as string,
        poolId: t.pool_id as string,
        cardId: (t.card_id as string) ?? null,
        failureReason: null,
        date: t.created_at as string,
      })),
      ...((ledger.data ?? []) as Array<Record<string, unknown>>).map((t) => ({
        id: t.id as string,
        source: "user_transactions" as const,
        kind: t.type as string,
        amount: Number(t.amount),
        provider: "balance",
        status: "completed",
        reference: (t.reference_id as string) ?? null,
        userId: t.user_id as string,
        poolId: (t.pool_id as string) ?? null,
        cardId: null,
        failureReason: null,
        date: t.created_at as string,
      })),
      ...((withdrawals.data ?? []) as Array<Record<string, unknown>>).map((w) => ({
        id: w.id as string,
        source: "payout_requests" as const,
        kind: "withdrawal",
        amount: -Number(w.amount),
        provider: (w.provider as string) ?? "paypal",
        status: w.status as string,
        reference: (w.provider_reference as string) ?? (w.stripe_transfer_id as string) ?? null,
        userId: w.user_id as string,
        poolId: (w.pool_id as string) ?? null,
        cardId: null,
        failureReason: (w.failure_reason as string) ?? (w.review_reason as string) ?? null,
        date: w.created_at as string,
      })),
    ];

    // Type-specific narrowing after the merge.
    if (type === "deposits" || type === "entry_fees") rows = rows.filter((r) => r.kind === "entry_fee");
    if (type === "refunds") rows = rows.filter((r) => r.kind === "refund" || r.kind === "refund_required");
    if (type === "withdrawals") rows = rows.filter((r) => r.kind === "withdrawal");
    if (type === "payouts") rows = rows.filter((r) => r.kind === "withdrawal" || r.kind === "payout");
    if (type === "winnings") rows = rows.filter((r) => r.kind.startsWith("winning"));
    if (type === "failed") rows = rows.filter((r) => r.status === "failed");
    if (status) rows = rows.filter((r) => r.status === status);
    if (provider) rows = rows.filter((r) => r.provider === provider);

    rows.sort((a, b) => b.date.localeCompare(a.date));
    const total = rows.length;
    const pageRows = rows.slice((page - 1) * limit, page * limit);

    // Names for the page only.
    const userIds = [...new Set(pageRows.map((r) => r.userId).filter(Boolean))] as string[];
    const poolIds = [...new Set(pageRows.map((r) => r.poolId).filter(Boolean))] as string[];
    const [{ data: people }, { data: pools }] = await Promise.all([
      userIds.length ? admin.from("users").select("id, email, name").in("id", userIds) : Promise.resolve({ data: [] }),
      poolIds.length ? admin.from("pools").select("id, name").in("id", poolIds) : Promise.resolve({ data: [] }),
    ]);
    const personById = new Map((people ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));
    const poolById = new Map((pools ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));

    const decorated = pageRows.map((r) => ({
      ...r,
      user: r.userId ? personById.get(r.userId) ?? null : null,
      pool: r.poolId ? poolById.get(r.poolId) ?? null : null,
    }));

    const result = paged(decorated, total, page, limit);
    return NextResponse.json(
      { transactions: result.rows, ...result, truncated: rows.length >= WINDOW },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
