import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { isUuid, paged, parsePagination } from "@/lib/admin/helpers";
import { describePayoutProviders } from "@/lib/payouts";

/** Withdrawal queue with user, saved payout method and provider state. status=… or id=… */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "withdrawals.view" });
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "pending";
    const id = searchParams.get("id");
    const { page, limit, from, to } = parsePagination(searchParams);
    const admin = createAdminClient();

    let query = admin
      .from("payout_requests")
      .select("id, user_id, pool_id, amount, status, provider, provider_reference, stripe_transfer_id, failure_reason, review_reason, reviewed_by, reviewed_at, retry_count, created_at, processed_at, processed_by, pools(id, name)", { count: "exact" })
      .order("created_at", { ascending: false });
    if (isUuid(id)) query = query.eq("id", id);
    else if (status === "queue") query = query.in("status", ["pending", "approved", "on_hold", "processing"]);
    else if (status !== "all") query = query.eq("status", status);

    const { data: raw, count, error } = await query.range(from, to);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const rows = (raw ?? []) as unknown as Array<Record<string, unknown>>;

    const userIds = [...new Set(rows.map((r) => r.user_id as string))];
    const [{ data: users }, { data: accounts }] = await Promise.all([
      userIds.length ? admin.from("users").select("id, email, name, account_status, balance").in("id", userIds) : Promise.resolve({ data: [] }),
      userIds.length ? admin.from("user_payout_accounts").select("user_id, method, identifier").in("user_id", userIds) : Promise.resolve({ data: [] }),
    ]);
    const userById = new Map((users ?? []).map((u: Record<string, unknown>) => [u.id as string, u]));
    const accountByUser = new Map((accounts ?? []).map((a: Record<string, unknown>) => [a.user_id as string, a]));

    const result = paged(
      rows.map((r) => ({
        ...r,
        user: userById.get(r.user_id as string) ?? null,
        payoutAccount: accountByUser.get(r.user_id as string) ?? null,
      })),
      count,
      page,
      limit
    );
    return NextResponse.json({ withdrawals: result.rows, ...result, providers: describePayoutProviders() }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
