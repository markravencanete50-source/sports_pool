"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface ChatRulesState {
  version: string;
  accepted: boolean;
  acceptedAt: string | null;
  slowModeSeconds: number;
}

const KEY = ["/api/me/chat-rules"] as const;

/** Whether the signed-in user has accepted the current chat rules. */
export function useChatRules(enabled = true) {
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: async (): Promise<ChatRulesState> => {
      const res = await fetch("/api/me/chat-rules", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load chat rules");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
}

export function useAcceptChatRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (version: string) => {
      const res = await apiRequest("POST", "/api/me/chat-rules", { version });
      return res.json() as Promise<{ accepted: boolean; version: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useReportComment(poolId: string) {
  return useMutation({
    mutationFn: async ({ commentId, reason }: { commentId: string; reason: string }) => {
      const res = await apiRequest(
        "POST",
        `/api/pools/${poolId}/chat/${commentId}/report`,
        { reason }
      );
      return res.json() as Promise<{ reported: boolean }>;
    },
  });
}
