"use client";

import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";

export type SyncNFLGamesParams = {
  week?: number;
  season?: number;
  createWeeklyPublicPool?: boolean;
  poolName?: string;
  entryFee?: number;
};

export function useSyncNFLGames() {
  return useMutation({
    mutationFn: async (params: SyncNFLGamesParams = {}) => {
      const {
        week,
        season,
        createWeeklyPublicPool,
        poolName,
        entryFee,
      } = params;
      const res = await apiRequest("POST", "/api/sync/nfl-games", {
        week,
        season,
        createWeeklyPublicPool,
        poolName,
        entryFee,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const syncMsg = `Synced ${data.inserted || 0} new games, updated ${data.updated || 0} games`;
      if (data.pool && !data.poolSkipped) {
        const name = (data.pool as { name?: string }).name;
        toast.success(
          `${syncMsg}. Created public pool: ${name ?? "Week " + data.week}`
        );
      } else if (data.poolSkipped) {
        toast.success(`${syncMsg}. ${data.poolSkipped}`);
      } else {
        toast.success(syncMsg);
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to sync games: ${error.message}`);
    },
  });
}
