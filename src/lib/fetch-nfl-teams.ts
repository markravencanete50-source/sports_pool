import type { TeamRow } from "@/lib/types";
import { NFL_SCOREBOARD_BASE_URL, getTeamLogoUrl } from "@/lib/constants";

type ESPNTeam = {
  id: string;
  abbreviation: string;
  displayName: string;
  location: string;
  color?: string;
  alternateColor?: string;
  logos?: Array<{ href: string; rel: string[] }>;
};

type ESPNTeamsResponse = {
  sports?: Array<{
    leagues?: Array<{
      teams?: Array<{ team: ESPNTeam }>;
    }>;
  }>;
};

function pickScoreboardLogo(logos: ESPNTeam["logos"]): string {
  if (!logos?.length) return "";
  const scoreboard = logos.find((l) => l.rel?.includes("scoreboard"));
  if (scoreboard?.href) return scoreboard.href;
  if (logos[0]?.href) return logos[0].href;
  return "";
}

function toHex(color: string | undefined): string {
  if (!color) return "#000000";
  const c = color.replace(/^#/, "");
  return c.length === 6 ? `#${c}` : "#000000";
}

export async function fetchNflTeamsFromApi(): Promise<TeamRow[]> {
  const base = NFL_SCOREBOARD_BASE_URL.replace(/\/$/, "");
  const url = `${base}/teams`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN teams API error: ${res.status}`);
  const data = (await res.json()) as ESPNTeamsResponse;
  const teams =
    data.sports?.[0]?.leagues?.[0]?.teams?.map(({ team }) => team) ?? [];
  const abbrToId: Record<string, string> = { WSH: "WAS" };
  return teams.map((t) => {
    const id = abbrToId[t.abbreviation] ?? t.abbreviation;
    const abbr = id;
    return {
      id,
      name: t.displayName ?? abbr,
      city: t.location ?? abbr,
      abbreviation: abbr,
      logo: pickScoreboardLogo(t.logos) || getTeamLogoUrl(abbr),
      primary_color: toHex(t.color),
      secondary_color: toHex(t.alternateColor),
    };
  });
}
