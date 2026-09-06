import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { isUuid, likeTerm, paged, parsePagination } from "@/lib/admin/helpers";

/** Chat messages for the moderation console. status=visible|hidden|flagged|deleted|all */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "moderation.view" });
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "all";
    const poolId = searchParams.get("poolId");
    const userId = searchParams.get("userId");
    const search = searchParams.get("search")?.trim() || "";
    const { page, limit, from, to } = parsePagination(searchParams);
    const admin = createAdminClient();

    let query = admin
      .from("comments")
      .select(
        "id, pool_id, user_id, text, game_id, moderation_status, moderated_by, moderated_at, moderation_reason, created_at, pools(id, name), author:profiles!comments_user_id_profiles_fkey(id, name), games(id, home_team_id, away_team_id)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });
    if (["visible", "hidden", "flagged", "deleted"].includes(status)) query = query.eq("moderation_status", status);
    if (isUuid(poolId)) query = query.eq("pool_id", poolId);
    if (isUuid(userId)) query = query.eq("user_id", userId);
    if (search) query = query.ilike("text", `%${likeTerm(search)}%`);

    const { data, count, error } = await query.range(from, to);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    const ids = rows.map((r) => r.id as string);
    const { data: reports } = ids.length
      ? await admin.from("content_reports").select("comment_id, status").in("comment_id", ids)
      : { data: [] as Array<Record<string, unknown>> };
    const reportCount = new Map<string, number>();
    for (const r of (reports ?? []) as Array<Record<string, unknown>>) {
      reportCount.set(r.comment_id as string, (reportCount.get(r.comment_id as string) ?? 0) + 1);
    }

    const result = paged(
      rows.map((r) => ({ ...r, reports: reportCount.get(r.id as string) ?? 0 })),
      count,
      page,
      limit
    );
    return NextResponse.json({ comments: result.rows, ...result }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
