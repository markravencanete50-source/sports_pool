import type { ESPNGame, ESPNScoreboardResponse } from "@/lib/types";

const NFL_REGULAR_SEASON_TYPE = 2;

export function nflSeasonYear(now = new Date()): number {
  return now.getUTCFullYear() - (now.getUTCMonth() < 2 ? 1 : 0);
}

/** A year-wide ESPN response starts with January's PREVIOUS season week 18.
 * Resolve the requested season's dated calendar, then fetch that exact week.
 */
export function resolveRegularSeasonWeek(board: ESPNScoreboardResponse, season: number, now = Date.now()): number | null {
  const calendar = board.leagues?.flatMap((league) => league.calendar ?? [])
    .find((part) => part.value === "2" && new Date(part.startDate ?? "").getUTCFullYear() === season);
  const weeks = (calendar?.entries ?? []).filter((entry) =>
    Number.isInteger(Number(entry.value)) && Number(entry.value) >= 1 && Number(entry.value) <= 18 &&
    Number.isFinite(Date.parse(entry.startDate)) && Number.isFinite(Date.parse(entry.endDate)),
  ).sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));
  if (weeks.length) {
    const current = weeks.find((entry) => Date.parse(entry.endDate) >= now) ?? weeks[weeks.length - 1];
    return Number(current.value);
  }
  const matching = (board.events ?? []).filter((game) => game.season?.year === season && game.season?.type === 2)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const next = matching.find((game) => Date.parse(game.date) >= now);
  if (next?.week?.number) return next.week.number;
  if (board.season?.year === season && board.season?.type === 2 && board.week?.number >= 1 && board.week.number <= 18) return board.week.number;
  return matching.at(-1)?.week?.number ?? null;
}

/**
 * ESPN's scoreboard endpoint can return preseason and historical events even
 * when dates/seasontype are supplied without a week. Keep every consumer on
 * the exact regular-season slate the caller requested.
 */
export function isGameInRegularSeasonSlate(
  game: ESPNGame,
  season: number,
  week: number,
): boolean {
  return (
    game.season?.year === season &&
    game.season?.type === NFL_REGULAR_SEASON_TYPE &&
    game.week?.number === week
  );
}

export function filterRegularSeasonSlate(
  games: ESPNGame[],
  season: number,
  week: number,
): ESPNGame[] {
  return games.filter((game) =>
    isGameInRegularSeasonSlate(game, season, week),
  );
}
