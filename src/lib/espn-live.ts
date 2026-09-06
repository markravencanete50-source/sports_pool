import type { ESPNGame } from "@/lib/types";
import { mapESPNTeamToDB } from "@/lib/constants";

type Competition = ESPNGame["competitions"][number];

/**
 * The live-state columns on public.games, derived from one ESPN competition.
 *
 * ESPN only sends a `situation` block while a game is in progress, and its
 * `possession` is ESPN's own team id rather than an abbreviation. This maps it
 * onto our team id (the abbreviation the rest of the app keys on) so the
 * field panel can highlight the right side without a second lookup.
 *
 * Everything is nullable on purpose: before kickoff and after the final there
 * is no clock and no ball, and writing stale values would leave a finished
 * game showing "3rd & 7" forever.
 */
export interface LiveStatePatch {
  period: number | null;
  display_clock: string | null;
  possession: string | null;
  down_distance: string | null;
  yard_line: number | null;
  is_red_zone: boolean;
  last_synced_at: string;
}

export function isCompetitionInProgress(competition: Competition): boolean {
  const type = competition.status?.type;
  if (!type) return false;
  if (type.completed) return false;
  if (type.state === "in") return true;
  const desc = type.description ?? "";
  return /in progress|halftime|end of|overtime|\bq[1-4]\b|\bot\b/i.test(desc);
}

export function extractLiveState(
  competition: Competition,
  now: Date = new Date()
): LiveStatePatch {
  const inProgress = isCompetitionInProgress(competition);
  const situation = competition.situation;

  let possession: string | null = null;
  if (inProgress && situation?.possession) {
    const holder = competition.competitors?.find(
      (c) => c.id === situation.possession || c.team?.id === situation.possession
    );
    const abbr = holder?.team?.abbreviation;
    if (abbr) possession = mapESPNTeamToDB(abbr) ?? abbr;
  }

  const period =
    typeof competition.status?.period === "number" ? competition.status.period : null;

  return {
    period,
    display_clock: inProgress ? competition.status?.displayClock ?? null : null,
    possession,
    down_distance: inProgress
      ? situation?.downDistanceText ?? situation?.shortDownDistanceText ?? null
      : null,
    yard_line:
      inProgress && typeof situation?.yardLine === "number" ? situation.yardLine : null,
    is_red_zone: Boolean(inProgress && situation?.isRedZone),
    last_synced_at: now.toISOString(),
  };
}
