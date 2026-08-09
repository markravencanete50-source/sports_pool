import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getUserCardScore } from "@/lib/winners";
import {
  attachFinancialsToPools,
  getPoolsFinancials,
} from "@/lib/pool-financials";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const outcome = searchParams.get("outcome") || "all";
    const page = Math.max(
      1,
      parseInt(searchParams.get("page") || String(DEFAULT_PAGE), 10) ||
        DEFAULT_PAGE
    );
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(
        1,
        parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10) ||
          DEFAULT_LIMIT
      )
    );

    const { data: userCards } = await supabase
      .from("parlay_cards")
      .select("id, pool_id")
      .eq("user_id", user.id)
      .in("status", ["pending", "active", "completed", "cancelled"]);

    if (!userCards?.length) {
      return NextResponse.json(
        { games: [], total: 0, page, limit, totalPages: 1 },
        { status: 200 }
      );
    }

    const poolIds = [...new Set(userCards.map((c) => c.pool_id))];

    // pools.prize_pot and pools.participants are written as 0 when a pool is
    // created and never updated again, so reading them here showed a $0 pot and
    // 0 players for every pool on this screen. Both come from
    // get_pools_financials below, as they do in /api/pools.
    let query = supabase
      .from("pools")
      .select("id, name, type, status, entry_fee, week")
      .in("id", poolIds)
      .order("created_at", { ascending: false });

    if (search.length > 0) {
      query = query.ilike("name", `%${search.replace(/%/g, "\\%")}%`);
    }

    const { data: pools, error: poolsError } = await query;

    if (poolsError) {
      return NextResponse.json({ error: poolsError.message }, { status: 400 });
    }

    const financialsMap = await getPoolsFinancials(
      supabase,
      (pools ?? []).map((p: { id: string }) => p.id)
    );
    const poolList = attachFinancialsToPools(pools ?? [], financialsMap);
    const completedPoolIds = poolList
      .filter((p: { status: string }) => p.status === "completed")
      .map((p: { id: string }) => p.id);

    const winnersMap: Record<
      string,
      {
        amount: number;
        correct: number;
        total: number;
        winning_card_id?: string;
        approved_at: string | null;
      }
    > = {};
    if (completedPoolIds.length > 0) {
      const { data: winners } = await supabase
        .from("pool_winners")
        .select("pool_id, amount, correct, total, winning_card_id, approved_at")
        .eq("user_id", user.id)
        .in("pool_id", completedPoolIds);
      for (const w of winners ?? []) {
        winnersMap[w.pool_id] = {
          amount: Number(w.amount),
          correct: w.correct,
          total: w.total,
          winning_card_id: w.winning_card_id ?? undefined,
          approved_at: w.approved_at ?? null,
        };
      }
    }

    const { data: approvals } = await supabase
      .from("payout_approvals")
      .select("pool_id, status")
      .eq("user_id", user.id)
      .in("pool_id", completedPoolIds);
    const approvalByPool: Record<string, string> = {};
    for (const a of approvals ?? []) {
      approvalByPool[a.pool_id] = a.status;
    }

    const lostPoolIds = completedPoolIds.filter((id) => !winnersMap[id]);
    const lostScoresMap: Record<string, { correct: number; total: number }> = {};
    if (lostPoolIds.length > 0) {
      const { data: lostCards } = await supabase
        .from("parlay_cards")
        .select("id, pool_id")
        .eq("user_id", user.id)
        .in("pool_id", lostPoolIds)
        .in("status", ["active", "completed"])
        .order("card_number", { ascending: true });
      if (lostCards?.length) {
        const cardIds = lostCards.map((c) => c.id);
        const cardByPool: Record<string, { id: string }> = {};
        for (const c of lostCards) {
          if (!cardByPool[c.pool_id]) cardByPool[c.pool_id] = { id: c.id };
        }
        const { data: lostPicks } = await supabase
          .from("card_picks")
          .select("card_id, game_id, prediction")
          .in("card_id", cardIds);
        const { data: lostPoolGames } = await supabase
          .from("pool_games")
          .select("pool_id, game_id, games(status, home_score, away_score)")
          .in("pool_id", lostPoolIds);
        const poolGamesByPool: Record<string, typeof lostPoolGames> = {};
        for (const pg of lostPoolGames ?? []) {
          const pid = (pg as { pool_id: string }).pool_id;
          if (!poolGamesByPool[pid]) poolGamesByPool[pid] = [];
          poolGamesByPool[pid].push(pg);
        }
        const picksList = lostPicks ?? [];
        for (const poolId of lostPoolIds) {
          const card = cardByPool[poolId];
          const poolGames = poolGamesByPool[poolId];
          if (!card || !poolGames?.length) continue;
          const score = getUserCardScore(
            poolGames as Parameters<typeof getUserCardScore>[0],
            picksList as {
              card_id: string;
              game_id: string;
              prediction: string | null;
            }[],
            card.id
          );
          if (score.total > 0) {
            lostScoresMap[poolId] = score;
          }
        }
      }
    }

    const games = poolList.map(
      (pool: {
        id: string;
        name: string;
        type: string;
        status: string;
        entry_fee?: number;
        participants?: number;
        prize_pot?: number;
        net_prize_pot?: number;
        week?: number;
      }) => {
        const win = winnersMap[pool.id];
        const isWon = !!win;
        const isApproved = isWon && !!win.approved_at;
        const approvalStatus = approvalByPool[pool.id];
        const claimable = isApproved && approvalStatus === "pending_claim";
        const claimed = isApproved && approvalStatus === "claimed";
        const outcomeValue =
          pool.status !== "completed" ? "pending" : isWon ? "won" : "lost";
        const lostScore = lostScoresMap[pool.id];
        return {
          poolId: pool.id,
          poolName: pool.name,
          type: pool.type,
          status: pool.status,
          entryFee: pool.entry_fee ?? 0,
          participants: pool.participants ?? 0,
          // Gross, matching /api/pools and the pool detail page. netPrizePot is
          // what a winner is actually paid, once the platform fee is taken.
          prizePot: pool.prize_pot ?? 0,
          netPrizePot: pool.net_prize_pot ?? 0,
          week: pool.week,
          outcome: outcomeValue,
          amount: isApproved ? win.amount : null,
          correct: win?.correct ?? lostScore?.correct ?? null,
          total: win?.total ?? lostScore?.total ?? null,
          winningCardId: win?.winning_card_id ?? null,
          pendingApproval: isWon && !isApproved,
          claimable,
          claimed,
        };
      }
    );

    let filtered = games;
    if (outcome === "won") {
      filtered = games.filter((g: { outcome: string }) => g.outcome === "won");
    } else if (outcome === "lost") {
      filtered = games.filter((g: { outcome: string }) => g.outcome === "lost");
    } else if (outcome === "pending") {
      filtered = games.filter(
        (g: { outcome: string }) => g.outcome === "pending"
      );
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const from = (page - 1) * limit;
    const paginated = filtered.slice(from, from + limit);

    return NextResponse.json(
      {
        games: paginated,
        total,
        page,
        limit,
        totalPages,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
