"use client";

import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";

export function useSyncTeams() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/sync/teams");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message ?? `Synced ${data.count ?? 0} teams`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to sync teams: ${error.message}`);
    },
  });
}
