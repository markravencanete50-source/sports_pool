"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";

export function useCompletePools() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pools/complete-finished");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pools"] });
      const completed = data?.completed ?? 0;
      toast.success(
        completed > 0
          ? `${completed} pool(s) marked completed`
          : "No pools to complete"
      );
    },
    onError: (error: Error) => {
      toast.error(`Failed to complete pools: ${error.message}`);
    },
  });
}
