"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";

export function usePayoutRequests(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["/api/me/payout-request"],
    queryFn: async () => {
      const res = await fetch("/api/me/payout-request", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch payout requests");
      const data = await res.json();
      return data.payoutRequests || [];
    },
    enabled: options?.enabled ?? true,
  });
}

export function useRequestPayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (amount: number) => {
      const res = await apiRequest("POST", "/api/me/payout-request", {
        amount,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(
          data.error ?? "Failed to request payout"
        ) as Error & {
          code?: string;
        };
        err.code = data.code;
        throw err;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/payout-request"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/balance"] });
      toast.success("Payout requested. Admin will process.");
    },
    onError: (error: Error & { error?: string }) => {
      toast.error(
        (error as any)?.error ?? error?.message ?? "Failed to request payout"
      );
    },
  });
}

export function useClaimPayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (poolId: string) => {
      const res = await apiRequest("POST", "/api/me/claim-payout", { poolId });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to claim payout");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/games"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/balance"] });
      toast.success("Payout claimed and added to your balance.");
    },
    onError: (error: Error & { error?: string }) => {
      toast.error(
        (error as any)?.error ?? error?.message ?? "Failed to claim payout"
      );
    },
  });
}
