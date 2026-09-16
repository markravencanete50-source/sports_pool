"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";

export type SyncNFLGamesParams = {
  week?: number;
  season?: number;
  createWeeklyPublicPool?: boolean;
  poolName?: string;
  entryFee?: number;
  reason?: string;
};

export function useSyncNFLGames() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: SyncNFLGamesParams = {}) => {
      const {
        week,
        season,
        createWeeklyPublicPool,
        poolName,
        entryFee,
        reason,
      } = params;
      const res = await apiRequest("POST", "/api/sync/nfl-games", {
        week,
        season,
        createWeeklyPublicPool,
        poolName,
        entryFee,
        reason,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pools"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pools"] });
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
