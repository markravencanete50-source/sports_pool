export const MINIMUM_PAYOUT_AMOUNT = 50;

/** Game statuses that count as "disrupted" (canceled/postponed) — auto-win for all picks. */
export const DISRUPTED_STATUSES = [
  "canceled",
  "cancelled",
  "postponed",
] as const;

/** Base URL for NFL scoreboard. Switch in .env: live ESPN vs your mock (e.g. http://localhost:3000/api/nfl). */
export const NFL_SCOREBOARD_BASE_URL =
  process.env.NFL_SCOREBOARD_BASE_URL ||
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

export const NFL_TEAM_LOGO_BASE =
  "https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard";

const LOGO_SLUG_OVERRIDE: Record<string, string> = { WAS: "wsh" };

export function getTeamLogoUrl(abbreviation: string): string {
  const slug =
    LOGO_SLUG_OVERRIDE[abbreviation?.toUpperCase()] ??
    abbreviation?.toLowerCase() ??
    "";
  return `${NFL_TEAM_LOGO_BASE}/${slug}.png`;
}

export const TEAM_MAP: Record<string, string> = {
  KC: "KC",
  SF: "SF",
  BAL: "BAL",
  DET: "DET",
  BUF: "BUF",
  PHI: "PHI",
  CIN: "CIN",
  MIA: "MIA",
  GB: "GB",
  LAR: "LAR",
  NYJ: "NYJ",
  CLE: "CLE",
  NE: "NE",
  PIT: "PIT",
  HOU: "HOU",
  IND: "IND",
  JAX: "JAX",
  TEN: "TEN",
  DEN: "DEN",
  LV: "LV",
  LAC: "LAC",
  DAL: "DAL",
  NYG: "NYG",
  WAS: "WAS",
  WSH: "WAS",
  CHI: "CHI",
  MIN: "MIN",
  ATL: "ATL",
  CAR: "CAR",
  NO: "NO",
  TB: "TB",
  ARI: "ARI",
  SEA: "SEA",
} as const;

export const mapESPNTeamToDB = (espnAbbr: string): string | null => {
  return TEAM_MAP[espnAbbr] || null;
};
