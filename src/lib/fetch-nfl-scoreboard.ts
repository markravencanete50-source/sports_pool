/**
 * Fetches NFL scoreboard from the base URL in .env (NFL_SCOREBOARD_BASE_URL).
 * Set to live ESPN URL or your mock (e.g. http://localhost:3000/api/nfl) to switch.
 */

import type { ESPNScoreboardResponse } from "@/lib/types";
import { NFL_SCOREBOARD_BASE_URL } from "@/lib/constants";

export async function getNflScoreboard(
  season?: number | null,
  week?: number | null
): Promise<ESPNScoreboardResponse> {
  const year = season ?? new Date().getFullYear();
  const base = NFL_SCOREBOARD_BASE_URL.replace(/\/$/, "");
  const path = "/scoreboard";
  const params = new URLSearchParams({
    dates: String(year),
    seasontype: "2",
  });
  if (week != null) params.set("week", String(week));
  const url = `${base}${path}?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { details?: string }).details ??
        (err as { error?: string }).error ??
        res.statusText
    );
  }
  const data = (await res.json()) as ESPNScoreboardResponse;
  return data;
}
