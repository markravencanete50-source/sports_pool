import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { GameStatus } from "@/lib/enums";
import { completePoolIfAllGamesFinished } from "@/lib/pool-completion";
import { materializePoolWinners } from "@/lib/materialize-winners";
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
    const isAdmin =
      (user.app_metadata?.role as string) === "admin" ||
      (currentUserProfile?.role as string) === "admin";
    if (!isPoolCreator && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const poolGameIds = pool.pool_games?.map((pg: any) => pg.game_id) || [];

    if (poolGameIds.length === 0) {
      return NextResponse.json(
        { message: "No games in this pool to sync" },
        { status: 200 }
      );
    }

    const currentYear = pool.season ?? new Date().getFullYear();
    const espnData = await getNflScoreboard(currentYear);
    const espnGames = espnData.events || [];

    let updatedCount = 0;
    const updates = [];

    for (const gameId of poolGameIds) {
      const espnGame = espnGames.find((g: any) => 
        g.competitions?.[0]?.id === gameId
      );

      if (espnGame) {
        const competition = espnGame.competitions[0];
        const homeTeam = competition.competitors.find((c: any) => c.homeAway === "home");
        const awayTeam = competition.competitors.find((c: any) => c.homeAway === "away");

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

    const poolCompleted = await completePoolIfAllGamesFinished(supabase, poolId);
    if (poolCompleted) {
      await materializePoolWinners(supabase, poolId);
    }

    return NextResponse.json(
      {
        message: "Pool games synced successfully",
        updated: updatedCount,
        total: poolGameIds.length,
        poolCompleted,
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
