import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getPoolsFinancials } from "@/lib/pool-financials";
import { isUuid, likeTerm, paged, parsePagination } from "@/lib/admin/helpers";

/**
 * Every pool on the platform, with the figures the console table shows.
 * status=open|active|paused|completed|cancelled, type=public|private,
 * search by name or id.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "pools.view" });
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const search = searchParams.get("search")?.trim() || "";
    const { page, limit, from, to } = parsePagination(searchParams);
    const admin = createAdminClient();

    let query = admin
      .from("pools")
      .select(
        "id, name, type, sport, status, status_reason, status_changed_at, entry_fee, max_participants, week, season, starts_at, ends_at, share_slug, platform_fee_percentage, is_system_weekly_pool, created_by, created_at, updated_at, " +
          "owner:profiles!pools_created_by_profiles_fkey(id, name), pool_games(game_id)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (status === "upcoming") query = query.eq("status", "open");
    else if (status && ["open", "active", "paused", "completed", "cancelled"].includes(status)) {
      query = query.eq("status", status);
    }
    if (type === "public" || type === "private") query = query.eq("type", type);
    if (search) {
      query = isUuid(search) ? query.eq("id", search) : query.ilike("name", `%${likeTerm(search)}%`);
    }

    const { data: raw, count, error } = await query.range(from, to);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const data = (raw ?? []) as unknown as Array<Record<string, unknown>>;

    const ids = data.map((p) => p.id as string);
    const ownerIds = data.map((p) => p.created_by as string).filter(Boolean);
    const [financials, { data: winnerRows }, { data: ownerEmails }] = await Promise.all([
      getPoolsFinancials(admin, ids),
      ids.length
        ? admin.from("pool_winners").select("pool_id, user_id, amount, users!pool_winners_user_id_fkey(name)").in("pool_id", ids)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      ownerIds.length
        ? admin.from("users").select("id, email").in("id", ownerIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);
    const emailById = new Map((ownerEmails ?? []).map((u: Record<string, unknown>) => [u.id as string, u.email as string]));
    const winnersByPool = new Map<string, Array<Record<string, unknown>>>();
    for (const w of (winnerRows ?? []) as Array<Record<string, unknown>>) {
      const list = winnersByPool.get(w.pool_id as string) ?? [];
      list.push(w);
      winnersByPool.set(w.pool_id as string, list);
    }

    const rows = data.map((p) => {
      const fin = financials.get(p.id as string);
      const winners = winnersByPool.get(p.id as string) ?? [];
      const owner = p.owner as { id?: string; name?: string } | null;
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        sport: p.sport,
        status: p.status,
        status_reason: p.status_reason,
        entry_fee: Number(p.entry_fee),
        participants: fin?.paid_participant_count ?? 0,
        prize_pot: fin?.prize_pot ?? 0,
        platform_fee_percentage: p.platform_fee_percentage,
        platform_fee: fin ? Number(((fin.prize_pot ?? 0) * Number(p.platform_fee_percentage ?? 10)) / 100) : 0,
        max_participants: p.max_participants,
        week: p.week,
        season: p.season,
        starts_at: p.starts_at,
        ends_at: p.ends_at,
        share_slug: p.share_slug,
        is_system_weekly_pool: p.is_system_weekly_pool,
        games: Array.isArray(p.pool_games) ? p.pool_games.length : 0,
        owner: owner ? { id: owner.id, name: owner.name, email: emailById.get(owner.id ?? "") ?? null } : null,
        winners: winners.map((w) => ({
          user_id: w.user_id,
          name: (w.users as { name?: string } | null)?.name ?? null,
          amount: Number(w.amount),
        })),
        created_at: p.created_at,
      };
    });

    const result = paged(rows, count, page, limit);
    return NextResponse.json({ pools: result.rows, ...result }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
