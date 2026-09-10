import type { ESPNGame } from "@/lib/types";

const NFL_REGULAR_SEASON_TYPE = 2;

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
