"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { createClient } from "@/lib/supabase/client";
import {
  CreatePoolInput,
  UpdatePoolWithGamesInput,
} from "@/lib/validations";
import { PoolsListStatusFilter } from "@/lib/enums";
import type { UsePoolsParams, PoolsListResult } from "@/lib/types";

export type { UsePoolsParams, PoolsListResult } from "@/lib/types";

export function usePools(params: UsePoolsParams = {}) {
  const { type, status, search = "", page = 1, limit = 12 } = params;
  const queryKey = ["/api/pools", type, status, search, page, limit];

  return useQuery({
    queryKey,
    queryFn: async (): Promise<PoolsListResult> => {
      const urlParams = new URLSearchParams();
      if (type) urlParams.append("type", type);
      if (status && status !== PoolsListStatusFilter.ALL)
        urlParams.append("status", status);
      if (search.trim()) urlParams.append("search", search.trim());
      urlParams.append("page", String(page));
      urlParams.append("limit", String(limit));
      const url = `/api/pools?${urlParams.toString()}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pools");
      const data = await res.json();
      const pools = data.pools || [];
      const total = data.total ?? pools.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      return {
        pools,
        total,
        page: data.page ?? page,
        limit: data.limit ?? limit,
        totalPages,
      };
    },
  });
}

export function usePool(poolId: string) {
  return useQuery({
    queryKey: ["/api/pools", poolId],
    queryFn: async () => {
      const res = await fetch(`/api/pools/${poolId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pool");
      const data = await res.json();
      return data.pool;
    },
    enabled: !!poolId,
  });
}

export function useCreatePool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreatePoolInput) => {
      const res = await apiRequest("POST", "/api/pools", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pools"] });
    },
  });
}

export function useUpdatePool(poolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdatePoolWithGamesInput) => {
      const res = await apiRequest("PATCH", `/api/pools/${poolId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pools"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pools", poolId] });
    },
  });
}


export function usePoolComments(poolId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["/api/pools", poolId, "chat"],
    queryFn: async () => {
      const res = await fetch(`/api/pools/${poolId}/chat`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        const error = new Error(
          data.error || "Failed to fetch comments"
        ) as Error & { requiresCard?: boolean };
        error.requiresCard = data.requiresCard;
        throw error;
      }
      return data.comments || [];
    },
    enabled: !!poolId,
    retry: false,
  });

  useEffect(() => {
    if (!poolId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`comments:pool_id=eq.${poolId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `pool_id=eq.${poolId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["/api/pools", poolId, "chat"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [poolId, queryClient]);

  return query;
}

export function useAddComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      poolId,
      text,
    }: {
      poolId: string;
      text: string;
    }) => {
      const res = await apiRequest("POST", `/api/pools/${poolId}/chat`, { text });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pools", variables.poolId, "chat"] });
    },
  });
}
