"use client";

import { useQuery } from "@tanstack/react-query";

export function useWinners(limit = 10) {
  return useQuery({
    queryKey: ["/api/winners", limit],
    queryFn: async () => {
      const res = await fetch(`/api/winners?limit=${limit}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch winners");
      const data = await res.json();
      return data.winners || [];
    },
  });
}
