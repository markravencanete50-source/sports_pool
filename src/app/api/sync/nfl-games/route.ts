import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ESPNTeam, ESPNGame, ESPNScoreboardResponse, GameStatus } from "@/lib/types";
import { mapESPNTeamToDB } from "@/lib/constants";
import { GameStatus as GameStatusEnum, PoolStatus, PoolType } from "@/lib/enums";
import { getNflScoreboard } from "@/lib/fetch-nfl-scoreboard";
import { ensureTeamsExist } from "@/lib/teams-seed";
import { poolConfig } from "@/lib/config";
import { completePoolIfAllGamesFinished } from "@/lib/pool-completion";
import { materializePoolWinners } from "@/lib/materialize-winners";

function getGameStatus(competition: ESPNGame["competitions"][0]): GameStatus {
  const status = competition.status.type;
  if (status.completed) return GameStatusEnum.FINISHED;
  if (status.description === "In Progress" || status.description.includes("Q")) return GameStatusEnum.LIVE;
  return GameStatusEnum.SCHEDULED;
}

async function syncSpecificGames(supabase: any, gameIds: string[]) {
  try {
    const currentYear = new Date().getFullYear();
    const espnData = await getNflScoreboard(currentYear);
    const espnGames = espnData.events || [];

    let updatedCount = 0;

    for (const gameId of gameIds) {
      const espnGame = espnGames.find((g: any) => 
        g.competitions?.[0]?.id === gameId
      );

      if (espnGame) {
        const competition = espnGame.competitions[0];
        const homeTeam = competition.competitors.find((c: any) => c.homeAway === "home");
        const awayTeam = competition.competitors.find((c: any) => c.homeAway === "away");

        if (homeTeam && awayTeam) {
          const homeTeamId = mapESPNTeamToDB(homeTeam.team.abbreviation);
          const awayTeamId = mapESPNTeamToDB(awayTeam.team.abbreviation);

          if (!homeTeamId || !awayTeamId) continue;

          const gameStatus = getGameStatus(competition);
          const homeScore = homeTeam.score ? parseInt(homeTeam.score) : null;
          const awayScore = awayTeam.score ? parseInt(awayTeam.score) : null;
          const odds = competition.odds?.[0]?.details || null;

          const { error } = await supabase
            .from("games")
            .update({
              status: gameStatus,
              home_score: homeScore,
              away_score: awayScore,
              odds: odds,
            })
            .eq("id", gameId);

          if (!error) {
            updatedCount++;
          }
        }
      }
    }

    const completedIds = await runCompleteFinishedPools(supabase);
    return NextResponse.json(
      {
        message: "Games synced successfully",
        updated: updatedCount,
        total: gameIds.length,
        completedPools: completedIds.length,
        completedPoolIds: completedIds,
      },
      { status: 200 }
    );
  } catch (error) {
    throw error;
  }
}

async function runCompleteFinishedPools(supabase: Parameters<typeof completePoolIfAllGamesFinished>[0]): Promise<string[]> {
  const { data: pools } = await supabase
    .from("pools")
    .select("id")
    .in("status", [PoolStatus.OPEN, PoolStatus.ACTIVE]);
  const poolIds = (pools ?? []).map((p: { id: string }) => p.id);
  const completedIds: string[] = [];
  for (const poolId of poolIds) {
    const completed = await completePoolIfAllGamesFinished(supabase, poolId);
    if (completed) {
      await materializePoolWinners(supabase, poolId);
      completedIds.push(poolId);
    }
  }
  return completedIds;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (auth instanceof NextResponse) return auth;

    const body = (await request.json().catch(() => ({}))) || {};
    const {
      gameIds,
      week,
      season,
      createWeeklyPublicPool,
      poolName,
      entryFee,
    } = body;

    if (gameIds && Array.isArray(gameIds) && gameIds.length > 0) {
      return await syncSpecificGames(supabase, gameIds);
    }

    const currentYear = season ?? new Date().getFullYear();
    const requestedWeek = week ?? null;

    let espnData = await getNflScoreboard(currentYear, requestedWeek);
    let allEvents: ESPNGame[] = espnData.events || [];

    const responseWeek =
      espnData.week?.number ?? allEvents[0]?.week?.number ?? null;

    let games: ESPNGame[];
    if (requestedWeek != null) {
      games = allEvents;
    } else if (responseWeek != null) {
      const inWeek = allEvents.filter((g) => g.week?.number === responseWeek);
      if (inWeek.length < allEvents.length) {
        espnData = await getNflScoreboard(currentYear, responseWeek);
        games = espnData.events || [];
      } else {
        games = inWeek;
      }
    } else {
      games = allEvents;
    }

    if (games.length === 0) {
      return NextResponse.json(
        {
          message:
            responseWeek != null
              ? `No games found for week ${responseWeek}`
              : "No games found for the specified week/season",
          games: [],
        },
        { status: 200 }
      );
    }

    const gamesToInsert = [];
    const gamesToUpdate = [];

    for (const game of games) {
      const competition = game.competitions[0];
      if (!competition) continue;

      const homeTeam = competition.competitors.find((c) => c.homeAway === "home");
      const awayTeam = competition.competitors.find((c) => c.homeAway === "away");

      if (!homeTeam || !awayTeam) continue;

      const homeTeamId = mapESPNTeamToDB(homeTeam.team.abbreviation);
      const awayTeamId = mapESPNTeamToDB(awayTeam.team.abbreviation);

      if (!homeTeamId || !awayTeamId) {
        console.warn(`Skipping game: ${awayTeam.team.abbreviation} @ ${homeTeam.team.abbreviation} (teams not in DB)`);
        continue;
      }

      const gameWeek = game.week?.number ?? responseWeek;
      const gameSeason = game.season?.year ?? espnData.season?.year ?? currentYear;

      const gameDate = new Date(competition.date);
      const gameStatus = getGameStatus(competition);
      const homeScore = homeTeam.score ? parseInt(homeTeam.score) : null;
      const awayScore = awayTeam.score ? parseInt(awayTeam.score) : null;
      const odds = competition.odds?.[0]?.details || null;

      const gameData = {
        id: competition.id,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        date: gameDate.toISOString(),
        status: gameStatus,
        home_score: homeScore,
        away_score: awayScore,
        odds: odds,
        week: gameWeek,
        season: gameSeason,
      };

      const { data: existingGame } = await supabase
        .from("games")
        .select("id")
        .eq("id", competition.id)
        .single();

      if (existingGame) {
        gamesToUpdate.push(gameData);
      } else {
        gamesToInsert.push(gameData);
      }
    }

    let insertedCount = 0;
    if (gamesToInsert.length > 0) {
      const teamIds = [
        ...new Set(
          gamesToInsert.flatMap((g) => [g.home_team_id, g.away_team_id])
        ),
      ];
      await ensureTeamsExist(supabase, teamIds);

      const { error: insertError } = await supabase
        .from("games")
        .insert(gamesToInsert);

      if (insertError) {
        console.error("Error inserting games:", insertError);
        return NextResponse.json(
          { error: "Failed to insert games", details: insertError.message },
          { status: 500 }
        );
      }
      insertedCount = gamesToInsert.length;
    }

    let updatedCount = 0;
    if (gamesToUpdate.length > 0) {
      for (const game of gamesToUpdate) {
        const { error: updateError } = await supabase
          .from("games")
          .update({
            status: game.status,
            home_score: game.home_score,
            away_score: game.away_score,
            odds: game.odds,
          })
          .eq("id", game.id);

        if (!updateError) {
          updatedCount++;
        }
      }
    }

    const responsePayload: {
      message: string;
      inserted: number;
      updated: number;
      total: number;
      week?: number;
      season?: number;
      pool?: unknown;
      poolSkipped?: string;
    } = {
      message: "Games synced successfully",
      inserted: insertedCount,
      updated: updatedCount,
      total: games.length,
    };

    const syncedWeek = responseWeek ?? espnData.week?.number;
    const syncedSeason = espnData.season?.year ?? currentYear;

    if (
      createWeeklyPublicPool &&
      auth &&
      !(auth instanceof NextResponse) &&
      typeof auth.user?.id === "string" &&
      syncedWeek != null
    ) {
      const syncedGameIds = [
        ...gamesToInsert.map((g) => g.id),
        ...gamesToUpdate.map((g) => g.id),
      ];

      if (syncedGameIds.length >= poolConfig.minGames) {
        const { data: existingSystemWeekly } = await supabase
          .from("pools")
          .select("id, name")
          .eq("is_system_weekly_pool", true)
          .eq("week_id", syncedWeek)
          .limit(1)
          .maybeSingle();

        if (existingSystemWeekly) {
          responsePayload.poolSkipped = `System weekly pool for Week ${syncedWeek} already exists: ${existingSystemWeekly.name}`;
          responsePayload.pool = existingSystemWeekly;
        } else {
          const name =
            poolName?.trim() ||
            `NFL Week ${syncedWeek} ${syncedSeason ?? currentYear} Public Pool`;
          const fee = Number(entryFee);
          const entryFeeAmount =
            !Number.isNaN(fee) && fee >= 20 ? fee : 20;

          const { data: newPool, error: poolError } = await supabase
            .from("pools")
            .insert({
              name,
              type: PoolType.PUBLIC,
              entry_fee: entryFeeAmount,
              max_participants: null,
              week: syncedWeek,
              status: PoolStatus.OPEN,
              created_by: auth.user.id,
              participants: 0,
              prize_pot: 0,
              is_system_weekly_pool: true,
              week_id: syncedWeek,
            })
            .select()
            .single();

          if (poolError || !newPool) {
            responsePayload.poolSkipped = `Could not create pool: ${poolError?.message ?? "unknown"}`;
          } else {
            const poolGamesRows = syncedGameIds.map((gameId) => ({
              pool_id: newPool.id,
              game_id: gameId,
            }));
            const { error: pgError } = await supabase
              .from("pool_games")
              .insert(poolGamesRows);

            if (pgError) {
              await supabase.from("pools").delete().eq("id", newPool.id);
              responsePayload.poolSkipped = `Pool created but games failed: ${pgError.message}`;
            } else {
              await supabase.from("pool_participants").insert({
                pool_id: newPool.id,
                user_id: auth.user.id,
              });
              responsePayload.week = syncedWeek;
              responsePayload.season = syncedSeason ?? undefined;
              responsePayload.pool = newPool;
            }
          }
        }
      } else {
        responsePayload.poolSkipped = `Need at least ${poolConfig.minGames} games to create the weekly public pool (from .env); synced ${syncedGameIds.length}.`;
      }
    }

    const completedIds = await runCompleteFinishedPools(supabase);
    return NextResponse.json(
      { ...responsePayload, completedPools: completedIds.length, completedPoolIds: completedIds },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error syncing NFL games:", error);
    return NextResponse.json(
      {
        error: "Failed to sync NFL games",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekParam = searchParams.get("week");
    const seasonParam = searchParams.get("season") || new Date().getFullYear().toString();
    const season = parseInt(seasonParam, 10);
    const week = weekParam !== null && weekParam !== "" ? parseInt(weekParam, 10) : undefined;

    const espnData = await getNflScoreboard(season, week);

    return NextResponse.json(
      {
        games: espnData.events || [],
        week: espnData.week?.number,
        season: espnData.season?.year,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch NFL games",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
