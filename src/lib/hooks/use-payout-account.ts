"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";

export interface PayoutAccountInfo {
  method: string;
  identifierMasked: string;
  hasAccount: boolean;
}

export function usePayoutAccount(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["/api/me/payout-account"],
    enabled: options?.enabled !== false,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/me/payout-account");
      if (!res.ok) throw new Error("Failed to fetch payout account");
      const data = await res.json();
      return (data.payoutAccount ?? null) as PayoutAccountInfo | null;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (identifier: string) => {
      const res = await apiRequest("PUT", "/api/me/payout-account", {
        method: "paypal",
        identifier: identifier.trim(),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/payout-account"] });
      toast.success("PayPal account linked. You can request payouts.");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return {
    payoutAccount: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    savePayoutAccount: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}
