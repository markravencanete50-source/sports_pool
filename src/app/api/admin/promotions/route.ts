import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { paged, parsePagination } from "@/lib/admin/helpers";

/** Promotion requests and campaigns. status=pending|approved|active|paused|rejected|cancelled|expired|all */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "promotions.view" });
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "all";
    const { page, limit, from, to } = parsePagination(searchParams);
    const admin = createAdminClient();

    // Expire windows that have passed, so the list and the marketplace agree.
    await admin
      .from("pool_promotions")
      .update({ status: "expired" })
      .eq("status", "active")
      .lt("ends_at", new Date().toISOString());

    let query = admin
      .from("pool_promotions")
      .select(
        "id, pool_id, requested_by, status, placement, pricing_model, amount, currency, payment_provider, payment_reference, paid_at, starts_at, ends_at, approved_by, approved_at, review_note, created_at, " +
          "pools(id, name, type, status), owner:profiles!pool_promotions_requested_by_fkey(id, name)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status);

    const { data, count, error } = await query.range(from, to);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const result = paged((data ?? []) as unknown as Array<Record<string, unknown>>, count, page, limit);
    return NextResponse.json({ promotions: result.rows, ...result }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
