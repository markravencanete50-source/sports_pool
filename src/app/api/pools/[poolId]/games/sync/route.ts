import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { GameStatus } from "@/lib/enums";
import { getNflScoreboard } from "@/lib/fetch-nfl-scoreboard";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const { poolId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: pool, error: poolError } = await supabase
      .from("pools")
      .select(`
        *,
        pool_games(game_id, games(*))
      `)
      .eq("id", poolId)
      .single();

    if (poolError || !pool) {
      return NextResponse.json(
        { error: "Pool not found" },
        { status: 404 }
      );
    }

    const { data: currentUserProfile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    const isPoolCreator = pool.created_by === user.id;
    // Table-authoritative, matching requireAdmin() and public.is_admin(): the
    // JWT claim cannot be revoked before it expires, so a demoted admin would
    // otherwise keep access for up to an hour.
    const isAdmin = (currentUserProfile?.role as string) === "admin";
    if (!isPoolCreator && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const poolGameIds =
      pool.pool_games?.map((pg: { game_id: string }) => pg.game_id) || [];

    if (poolGameIds.length === 0) {
      return NextResponse.json(
        { message: "No games in this pool to sync" },
        { status: 200 }
      );
    }

    // Fetch the POOL's week, not ESPN's current week. Without the week arg this
    // returned only the in-progress slate, so syncing a pool from any other week
    // matched nothing, updated 0 rows, and still returned 200 "synced
    // successfully" — a silent no-op that reads as success.
    const currentYear = pool.season ?? new Date().getFullYear();
    const espnData = await getNflScoreboard(currentYear, pool.week ?? null);
    const espnGames = espnData.events || [];

    let updatedCount = 0;
    const updates = [];

    for (const gameId of poolGameIds) {
      const espnGame = espnGames.find((g) =>
        g.competitions?.[0]?.id === gameId
      );

      if (espnGame) {
        const competition = espnGame.competitions[0];
        const homeTeam = competition.competitors.find((c) => c.homeAway === "home");
        const awayTeam = competition.competitors.find((c) => c.homeAway === "away");

        if (homeTeam && awayTeam) {
          const desc = competition.status.type.description ?? "";
          const gameStatus = competition.status.type.completed
            ? GameStatus.FINISHED
            : desc === "In Progress" || desc.includes("Q")
              ? GameStatus.LIVE
              : GameStatus.SCHEDULED;
          const homeScore = homeTeam.score ? parseInt(homeTeam.score) : null;
          const awayScore = awayTeam.score ? parseInt(awayTeam.score) : null;
          const odds = competition.odds?.[0]?.details || null;

          updates.push({
            id: gameId,
            status: gameStatus,
            home_score: homeScore,
            away_score: awayScore,
            odds: odds,
          });
        }
      }
    }

    if (updates.length > 0) {
      for (const update of updates) {
        const { error } = await supabase
          .from("games")
          .update({
            status: update.status,
            home_score: update.home_score,
            away_score: update.away_score,
            odds: update.odds,
          })
          .eq("id", update.id);

        if (!error) {
          updatedCount++;
        }
      }
    }

    // Settlement (pool completion, winner materialization, balance credits) is
    // reserved for the admin sync route and /api/cron/settle — this route is
    // reachable by pool creators, who must not be able to drive payouts.
    return NextResponse.json(
      {
        message: "Pool games synced successfully",
        updated: updatedCount,
        total: poolGameIds.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error syncing pool games:", error);
    return NextResponse.json(
      {
        error: "Failed to sync pool games",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
