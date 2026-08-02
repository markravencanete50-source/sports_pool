"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { MeGamesResult, UseMeGamesParams } from "@/lib/types";

export type { UseMeGamesParams, MeGamesResult, MyGameEntry } from "@/lib/types";

export function useMeGames(
  params: UseMeGamesParams = {},
  options?: { enabled?: boolean }
) {
  const { search = "", outcome = "all", page = 1, limit = 12 } = params;
  const queryKey = ["/api/me/games", search, outcome, page, limit];

  return useQuery({
    queryKey,
    enabled: options?.enabled !== false,
    queryFn: async (): Promise<MeGamesResult> => {
      const urlParams = new URLSearchParams();
      if (search.trim()) urlParams.append("search", search.trim());
      if (outcome && outcome !== "all") urlParams.append("outcome", outcome);
      urlParams.append("page", String(page));
      urlParams.append("limit", String(limit));
      const url = `/api/me/games?${urlParams.toString()}`;
      const res = await apiRequest("GET", url);
      if (!res.ok) throw new Error("Failed to fetch my games");
      const data = await res.json();
      return {
        games: data.games ?? [],
        total: data.total ?? 0,
        page: data.page ?? page,
        limit: data.limit ?? limit,
        totalPages: data.totalPages ?? 1,
      };
    },
  });
}
