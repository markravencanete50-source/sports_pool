import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { isUuid, paged, parseDateRange, parsePagination } from "@/lib/admin/helpers";

/** The administrative audit record. action=prefix, actorId=, targetId=, from=, to= */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "audit.view" });
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action")?.trim() || "";
    const actorId = searchParams.get("actorId");
    const targetId = searchParams.get("targetId");
    const { from: dateFrom, to: dateTo } = parseDateRange(searchParams);
    const { page, limit, from, to } = parsePagination(searchParams);
    const admin = createAdminClient();

    let query = admin
      .from("admin_audit_log")
      .select("id, actor_id, action, target_type, target_id, before_state, after_state, reason, created_at", { count: "exact" })
      .order("created_at", { ascending: false });
    if (action && /^[a-z0-9_.]{1,60}$/.test(action)) query = query.like("action", `${action}%`);
    if (isUuid(actorId)) query = query.eq("actor_id", actorId);
    if (isUuid(targetId)) query = query.eq("target_id", targetId);
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo);

    const { data, count, error } = await query.range(from, to);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
    const { data: actors } = actorIds.length
      ? await admin.from("users").select("id, email, name").in("id", actorIds)
      : { data: [] as Array<Record<string, unknown>> };
    const actorById = new Map((actors ?? []).map((a: Record<string, unknown>) => [a.id as string, a]));

    const result = paged(
      rows.map((r) => ({ ...r, actor: r.actor_id ? actorById.get(r.actor_id as string) ?? null : null })),
      count,
      page,
      limit
    );
    return NextResponse.json({ entries: result.rows, ...result }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
