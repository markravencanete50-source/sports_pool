/**
 * Mock NFL games for development/testing. Matches ESPN scoreboard response structure.
 * Use by setting NFL_SCOREBOARD_BASE_URL to your app base (e.g. http://localhost:3000/api/nfl).
 * All dates are January 2026 and above.
 */

import type { ESPNScoreboardResponse, ESPNGame } from "@/lib/types";
import { TEAM_MAP, getTeamLogoUrl } from "@/lib/constants";
import { getTeamRowsForAbbrevs } from "@/lib/teams-seed";

const TEAM_ABBREVS = Object.keys(TEAM_MAP) as string[];

function teamPayload(abbr: string, homeAway: "home" | "away", score?: string): { id: string; homeAway: "home" | "away"; team: { id: string; abbreviation: string; displayName: string; logo: string }; score?: string } {
  const rows = getTeamRowsForAbbrevs([abbr]);
  const displayName = rows[0]?.name ?? abbr;
  const idx = TEAM_ABBREVS.indexOf(abbr) + 1;
  const id = String(idx).padStart(2, "0");
  const payload = {
    id,
    homeAway,
    team: {
      id,
      abbreviation: abbr,
      displayName,
      logo: getTeamLogoUrl(abbr),
    },
  };
  if (score !== undefined) (payload as { score?: string }).score = score;
  return payload;
}

function pairForIndex(i: number): [string, string] {
  const a = TEAM_ABBREVS[i % TEAM_ABBREVS.length];
  const b = TEAM_ABBREVS[(i * 7 + 11) % TEAM_ABBREVS.length];
  return a === b ? [a, TEAM_ABBREVS[(i + 1) % TEAM_ABBREVS.length]] : [a, b];
}

const SEASON_YEAR = new Date().getFullYear();
const SEASON_TYPE = 2; // regular

function buildMockEvents(): ESPNGame[] {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(18, 0, 0, 0);
  const week1Start = tomorrow.getTime();

  const events: ESPNGame[] = [];
  for (let i = 0; i < 100; i++) {
    const weekNum = (i % 10) + 1;
    const weekStart = week1Start + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000;
    const dayOffset = (i % 7) * 24 * 60 * 60 * 1000;
    const gameDate = new Date(weekStart + dayOffset);
    gameDate.setHours(18, 0, 0, 0); // 6 PM local

    const [awayAbbr, homeAbbr] = pairForIndex(i);
    const gameId = `mock-nfl-${String(i + 1).padStart(3, "0")}`;
    const completed = false;
    const live = false;
    const homeScore = undefined;
    const awayScore = undefined;
    const statusDesc = "Scheduled";

    events.push({
      id: gameId,
      date: gameDate.toISOString(),
      week: { number: weekNum },
      season: { year: SEASON_YEAR, type: SEASON_TYPE },
      competitions: [
        {
          id: gameId,
          date: gameDate.toISOString(),
          status: {
            type: {
              completed,
              description: statusDesc,
            },
          },
          competitors: [
            teamPayload(homeAbbr, "home", homeScore),
            teamPayload(awayAbbr, "away", awayScore),
          ],
          odds:
            i % 3 === 0
              ? [{ details: `${homeAbbr} -${(i % 7) + 1}.5`, overUnder: (i % 15) + 38 }]
              : undefined,
        },
      ],
    });
  }
  return events;
}

function getMockEvents(): ESPNGame[] {
  return buildMockEvents();
}

/**
 * Returns mock ESPN scoreboard response. Optionally filter by week/season.
 * When week or season is provided, returns only matching games (same as live API).
 */
export function getMockNflScoreboardResponse(
  week?: number | null,
  season?: number | null
): ESPNScoreboardResponse {
  let events = getMockEvents();
  if (season != null && season !== SEASON_YEAR) {
    events = [];
  } else if (week != null) {
    events = events.filter((e) => e.week?.number === week);
  }
  return {
    week: { number: week ?? 1 },
    season: { year: season ?? SEASON_YEAR, type: SEASON_TYPE },
    events,
  };
}

export const MOCK_NFL_SEASON_YEAR = SEASON_YEAR;
export const MOCK_NFL_SEASON_TYPE = SEASON_TYPE;
