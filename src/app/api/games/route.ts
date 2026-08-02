import { NextResponse } from "next/server";
import {
  ESPNTeam,
  ESPNGame,
  ESPNScoreboardResponse,
  GameStatus,
} from "@/lib/types";
import { mapESPNTeamToDB } from "@/lib/constants";
import { GameStatus as GameStatusEnum } from "@/lib/enums";
import { getNflScoreboard } from "@/lib/fetch-nfl-scoreboard";

function getGameStatus(competition: ESPNGame["competitions"][0]): GameStatus {
  const status = competition.status.type;
  if (status.completed) return GameStatusEnum.FINISHED;
  if (status.description === "In Progress" || status.description.includes("Q"))
    return GameStatusEnum.LIVE;
  return GameStatusEnum.SCHEDULED;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const week = searchParams.get("week");
    const status = searchParams.get("status");
    const seasonParam =
      searchParams.get("season") || new Date().getFullYear().toString();
    const seasonNum = parseInt(seasonParam, 10);
    const weekNum =
      week !== null && week !== "" ? parseInt(week, 10) : undefined;

    let espnGames: ESPNGame[] = [];
    let weekNumber: number | null = null;
    let seasonYear = seasonNum;

    if (weekNum != null) {
      const espnData = await getNflScoreboard(seasonNum, weekNum);
      espnGames = espnData.events || [];
      weekNumber = espnData.week?.number ?? espnGames[0]?.week?.number ?? null;
      seasonYear =
        espnData.season?.year ?? espnGames[0]?.season?.year ?? seasonNum;
    } else {
      const currentWeekData = await getNflScoreboard(seasonNum, null);
      const currentWeek =
        currentWeekData.week?.number ??
        currentWeekData.events?.[0]?.week?.number ??
        1;
      const nextWeekData = await getNflScoreboard(seasonNum, currentWeek + 1);
      const currentEvents = currentWeekData.events || [];
      const nextEvents = nextWeekData.events || [];
      const seen = new Set<string>();
      espnGames = [...currentEvents, ...nextEvents].filter((g) => {
        const id = g.competitions?.[0]?.id ?? g.id;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      weekNumber = currentWeek;
      seasonYear =
        currentWeekData.season?.year ??
        currentWeekData.events?.[0]?.season?.year ??
        seasonNum;
    }

    let games = espnGames
      .map((game) => {
        const competition = game.competitions?.[0];
        if (!competition) return null;

        const homeTeam = competition.competitors?.find(
          (c: any) => c.homeAway === "home"
        );
        const awayTeam = competition.competitors?.find(
          (c: any) => c.homeAway === "away"
        );

        if (!homeTeam || !awayTeam) return null;

        const homeTeamId = mapESPNTeamToDB(homeTeam.team.abbreviation);
        const awayTeamId = mapESPNTeamToDB(awayTeam.team.abbreviation);

        if (!homeTeamId || !awayTeamId) return null;

        const gameDate = new Date(competition.date);
        const gameStatus = getGameStatus(competition);
        const homeScore = homeTeam.score ? parseInt(homeTeam.score) : null;
        const awayScore = awayTeam.score ? parseInt(awayTeam.score) : null;
        const odds = competition.odds?.[0]?.details || null;

        return {
          id: competition.id,
          homeTeamId: homeTeamId,
          awayTeamId: awayTeamId,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          date: gameDate.toISOString(),
          status: gameStatus,
          homeScore: homeScore,
          awayScore: awayScore,
          home_score: homeScore,
          away_score: awayScore,
          odds: odds,
          week: game.week?.number || weekNumber,
          season: game.season?.year || seasonYear,
          home_team: {
            id: homeTeamId,
            abbreviation: homeTeam.team.abbreviation,
            name: homeTeam.team.displayName,
            logo: homeTeam.team.logo,
          },
          away_team: {
            id: awayTeamId,
            abbreviation: awayTeam.team.abbreviation,
            name: awayTeam.team.displayName,
            logo: awayTeam.team.logo,
          },
        };
      })
      .filter((game) => game !== null)
      .sort(
        (a, b) => new Date(a!.date).getTime() - new Date(b!.date).getTime()
      );

    if (status) {
      games = games.filter((game) => game?.status === status);
    }

    return NextResponse.json(
      {
        games,
        week: weekNumber,
        season: seasonYear,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching games from ESPN:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch games",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
