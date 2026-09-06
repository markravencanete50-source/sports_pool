import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { isUuid, likeTerm, paged, parsePagination } from "@/lib/admin/helpers";

/**
 * User directory for the console.
 *
 * Filters: status=active|blocked|suspended, review=pending (age review
 * queue), verified=yes|no (date of birth on file), role=admin.
 * Search: name, email, or an exact user id.
 *
 * Per-user aggregates (balance, pools joined/created, deposits, winnings,
 * withdrawals) are computed for the page of users returned, not the whole
 * table, so this stays cheap at any user count.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "users.view" });
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status");
    const review = searchParams.get("review");
    const verified = searchParams.get("verified");
    const role = searchParams.get("role");
    const { page, limit, from, to } = parsePagination(searchParams);

    const admin = createAdminClient();

    let query = admin
      .from("users")
      .select(
        "id, email, name, avatar, role, admin_role, account_status, status_reason, suspended_until, balance, created_at, updated_at, last_active_at, " +
          "user_compliance!user_compliance_user_id_fkey(date_of_birth, age_verified_at, age_review_status, kyc_status, self_excluded_until)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (search.length > 0) {
      if (isUuid(search)) query = query.eq("id", search);
      else {
        const term = likeTerm(search);
        query = query.or(`email.ilike.%${term}%,name.ilike.%${term}%`);
      }
    }
    if (status && ["active", "blocked", "suspended"].includes(status)) {
      query = query.eq("account_status", status);
    }
    if (role === "admin") query = query.eq("role", "admin");
    if (review === "pending") {
      query = query.eq("user_compliance.age_review_status", "pending").not("user_compliance", "is", null);
    }
    if (verified === "yes") query = query.not("user_compliance.date_of_birth", "is", null);
    if (verified === "no") query = query.is("user_compliance.date_of_birth", null);

    const { data, count: total, error } = await query.range(from, to);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // The embedded-relation select string is beyond what supabase-js can type;
    // the rows are shaped exactly as selected above.
    const users = (data ?? []) as unknown as Array<Record<string, unknown>>;

    const ids = users.map((u) => u.id as string);
    const stats = new Map<
      string,
      { poolsJoined: number; poolsCreated: number; deposits: number; winnings: number; withdrawals: number }
    >();
    for (const id of ids) stats.set(id, { poolsJoined: 0, poolsCreated: 0, deposits: 0, winnings: 0, withdrawals: 0 });

    if (ids.length > 0) {
      const [participants, created, deposits, winnings, withdrawals] = await Promise.all([
        admin.from("pool_participants").select("user_id").in("user_id", ids),
        admin.from("pools").select("created_by").in("created_by", ids),
        admin
          .from("pool_transactions")
          .select("user_id, amount")
          .in("user_id", ids)
          .eq("status", "completed"),
        admin
          .from("user_transactions")
          .select("user_id, amount")
          .in("user_id", ids)
          .eq("type", "winning_approved"),
        admin.from("payout_requests").select("user_id, amount").in("user_id", ids).eq("status", "completed"),
      ]);
      for (const r of participants.data ?? []) stats.get(r.user_id as string)!.poolsJoined++;
      for (const r of created.data ?? []) stats.get(r.created_by as string)!.poolsCreated++;
      for (const r of deposits.data ?? []) stats.get(r.user_id as string)!.deposits += Number(r.amount);
      for (const r of winnings.data ?? []) stats.get(r.user_id as string)!.winnings += Number(r.amount);
      for (const r of withdrawals.data ?? []) stats.get(r.user_id as string)!.withdrawals += Number(r.amount);
    }

    const rows = users.map((u) => {
      const compliance = Array.isArray(u.user_compliance)
        ? (u.user_compliance[0] as Record<string, unknown> | undefined)
        : (u.user_compliance as Record<string, unknown> | null);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        avatar: u.avatar,
        role: u.role,
        admin_role: u.admin_role,
        account_status: u.account_status,
        status_reason: u.status_reason,
        suspended_until: u.suspended_until,
        balance: Number(u.balance ?? 0),
        created_at: u.created_at,
        last_active_at: u.last_active_at ?? u.updated_at,
        age_verified: Boolean(compliance?.date_of_birth),
        age_review_status: (compliance?.age_review_status as string | undefined) ?? "none",
        kyc_status: (compliance?.kyc_status as string | undefined) ?? "none",
        self_excluded_until: compliance?.self_excluded_until ?? null,
        ...stats.get(u.id as string)!,
      };
    });

    const result = paged(rows, total, page, limit);
    return NextResponse.json({ users: result.rows, ...result }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
