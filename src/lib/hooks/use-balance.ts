"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useBalance(options?: {
  enabled?: boolean;
  includeTransactions?: boolean;
}) {
  const includeTransactions = options?.includeTransactions ?? false;
  const queryKey = ["/api/me/balance", includeTransactions];

  return useQuery({
    queryKey,
    enabled: options?.enabled !== false,
    queryFn: async () => {
      const url = includeTransactions
        ? "/api/me/balance?transactions=true"
        : "/api/me/balance";
      const res = await apiRequest("GET", url);
      if (!res.ok) throw new Error("Failed to fetch balance");
      const data = await res.json();
      return {
        balance: Number(data.balance ?? 0),
        transactions: data.transactions ?? [],
        pendingClaims: data.pendingClaims ?? [],
      };
    },
  });
}
