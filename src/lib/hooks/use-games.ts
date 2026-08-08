"use client";

import { useQuery } from "@tanstack/react-query";

export function useGames(week?: number, status?: string, season?: number) {
  // Object key, not a filtered positional array: `.filter(Boolean)` dropped
  // undefined args so useGames(5) and useGames(undefined, undefined, 5) both
  // collapsed to ["/api/games", 5] and could serve each other's cached data.
  const queryKey = ["/api/games", { week, status, season }];

  return useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (week) params.append("week", week.toString());
      if (status) params.append("status", status);
      if (season) params.append("season", season.toString());
      const url = `/api/games${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch games");
      const data = await res.json();
      return {
        games: data.games || [],
        week: data.week,
        season: data.season,
      };
    },
  });
}

export function useGame(gameId: string) {
  return useQuery({
    queryKey: ["/api/games", gameId],
    queryFn: async () => {
      const res = await fetch(`/api/games/${gameId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch game");
      const data = await res.json();
      return data.game;
    },
    enabled: !!gameId,
  });
}
