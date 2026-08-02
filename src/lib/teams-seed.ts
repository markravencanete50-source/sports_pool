import type { SupabaseClient } from "@supabase/supabase-js";
import { TEAM_MAP, getTeamLogoUrl } from "@/lib/constants";
import type { TeamRow } from "@/lib/types";

const TEAM_NAMES: Record<string, string> = {
  KC: "Kansas City Chiefs", SF: "San Francisco 49ers", BAL: "Baltimore Ravens",
  DET: "Detroit Lions", BUF: "Buffalo Bills", PHI: "Philadelphia Eagles",
  CIN: "Cincinnati Bengals", MIA: "Miami Dolphins", GB: "Green Bay Packers",
  LAR: "Los Angeles Rams", NYJ: "New York Jets", CLE: "Cleveland Browns",
  NE: "New England Patriots", PIT: "Pittsburgh Steelers", HOU: "Houston Texans",
  IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars", TEN: "Tennessee Titans",
  DEN: "Denver Broncos", LV: "Las Vegas Raiders", LAC: "Los Angeles Chargers",
  DAL: "Dallas Cowboys", NYG: "New York Giants", WAS: "Washington Commanders",
  CHI: "Chicago Bears", MIN: "Minnesota Vikings", ATL: "Atlanta Falcons",
  CAR: "Carolina Panthers", NO: "New Orleans Saints", TB: "Tampa Bay Buccaneers",
  ARI: "Arizona Cardinals", SEA: "Seattle Seahawks",
};

const TEAM_CITIES: Record<string, string> = {
  KC: "Kansas City", SF: "San Francisco", BAL: "Baltimore", DET: "Detroit",
  BUF: "Buffalo", PHI: "Philadelphia", CIN: "Cincinnati", MIA: "Miami",
  GB: "Green Bay", LAR: "Los Angeles", NYJ: "New York", CLE: "Cleveland",
  NE: "Foxborough", PIT: "Pittsburgh", HOU: "Houston", IND: "Indianapolis",
  JAX: "Jacksonville", TEN: "Nashville", DEN: "Denver", LV: "Las Vegas",
  LAC: "Los Angeles", DAL: "Dallas", NYG: "New York", WAS: "Washington",
  CHI: "Chicago", MIN: "Minneapolis", ATL: "Atlanta", CAR: "Charlotte",
  NO: "New Orleans", TB: "Tampa Bay", ARI: "Phoenix", SEA: "Seattle",
};

function buildTeamRow(abbr: string): TeamRow {
  return {
    id: abbr,
    name: TEAM_NAMES[abbr] ?? abbr,
    city: TEAM_CITIES[abbr] ?? abbr,
    abbreviation: abbr,
    logo: getTeamLogoUrl(abbr),
    primary_color: "#000000",
    secondary_color: "#ffffff",
  };
}

const ALL_TEAMS: TeamRow[] = (Object.keys(TEAM_MAP) as string[]).map(buildTeamRow);

export function getTeamRowsForAbbrevs(abbrevs: string[]): TeamRow[] {
  const set = new Set(abbrevs);
  return ALL_TEAMS.filter((t) => set.has(t.id));
}

export function getTeamRowsForGames(games: { home_team_id: string; away_team_id: string }[]): TeamRow[] {
  const abbrevs = new Set<string>();
  for (const g of games) {
    abbrevs.add(g.home_team_id);
    abbrevs.add(g.away_team_id);
  }
  return getTeamRowsForAbbrevs([...abbrevs]);
}

export async function ensureTeamsExist(
  supabase: SupabaseClient,
  teamIds: string[]
): Promise<void> {
  const rows = getTeamRowsForAbbrevs(teamIds);
  if (rows.length === 0) return;
  await supabase.from("teams").upsert(rows, { onConflict: "id" });
}
