import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { paged, parsePagination } from "@/lib/admin/helpers";

/** Player reports. status=pending|resolved|dismissed|all */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "moderation.view" });
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "pending";
    const { page, limit, from, to } = parsePagination(searchParams);
    const admin = createAdminClient();

    let query = admin
      .from("content_reports")
      .select(
        "id, reason, status, action_taken, resolved_at, resolution_note, created_at, comment_id, pool_id, reporter_id, reported_user_id, " +
          "reporter:profiles!content_reports_reporter_id_fkey(id, name), reported:profiles!content_reports_reported_user_id_fkey(id, name), " +
          "comments(id, text, moderation_status), pools(id, name)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });
    if (["pending", "resolved", "dismissed"].includes(status)) query = query.eq("status", status);

    const { data, count, error } = await query.range(from, to);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const result = paged((data ?? []) as unknown as Array<Record<string, unknown>>, count, page, limit);
    return NextResponse.json({ reports: result.rows, ...result }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
