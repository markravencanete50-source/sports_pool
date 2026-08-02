"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { WinningEntry } from "@/lib/types";

export type { WinningEntry } from "@/lib/types";

export function useMeWinnings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["/api/me/winnings"],
    enabled: options?.enabled !== false,
    queryFn: async (): Promise<WinningEntry[]> => {
      const res = await apiRequest("GET", "/api/me/winnings");
      if (!res.ok) throw new Error("Failed to fetch winnings");
      const data = await res.json();
      return data.winnings ?? [];
    },
  });
}
