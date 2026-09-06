import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { likeTerm, paged, parsePagination } from "@/lib/admin/helpers";
import { NFL_SCOREBOARD_BASE_URL } from "@/lib/constants";

/**
 * Games with their live state and sync provenance, plus the scheduled jobs'
 * last outcomes so "sync status" is one screen.
 * status=live|scheduled|finished|disrupted, week=N, season=YYYY, search=TEAM|id
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "games.view" });
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const week = searchParams.get("week");
    const season = searchParams.get("season");
    const search = searchParams.get("search")?.trim() || "";
    const { page, limit, from, to } = parsePagination(searchParams);
    const admin = createAdminClient();

    let query = admin
      .from("games")
      .select("*, pool_games(pool_id)", { count: "exact" })
      .order("date", { ascending: false });

    if (status === "disrupted") query = query.in("status", ["postponed", "canceled", "cancelled", "suspended"]);
    else if (status && ["live", "scheduled", "finished"].includes(status)) query = query.eq("status", status);
    if (week && /^\d{1,2}$/.test(week)) query = query.eq("week", Number(week));
    if (season && /^\d{4}$/.test(season)) query = query.eq("season", Number(season));
    if (search) {
      const term = likeTerm(search).toUpperCase();
      query = query.or(`id.eq.${likeTerm(search)},home_team_id.eq.${term},away_team_id.eq.${term}`);
    }

    const [{ data, count, error }, { data: jobs }] = await Promise.all([
      query.range(from, to),
      admin.from("system_jobs").select("*"),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = (data ?? []).map((g: Record<string, unknown>) => ({
      ...g,
      pools: Array.isArray(g.pool_games) ? g.pool_games.length : 0,
      pool_games: undefined,
    }));

    const result = paged(rows, count, page, limit);
    return NextResponse.json(
      {
        games: result.rows,
        ...result,
        sync: {
          source: NFL_SCOREBOARD_BASE_URL,
          jobs: jobs ?? [],
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
