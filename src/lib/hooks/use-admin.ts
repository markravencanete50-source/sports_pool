"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import type { AdminRole, Permission } from "@/lib/admin/permissions";

/**
 * Data hooks for the admin console.
 *
 * Every read is a GET to /api/admin/*; every write goes through
 * useAdminAction, which posts the reason with the body and surfaces the
 * server's message. Authorization is not decided here — the server refuses
 * anything the caller's role does not include — but the overview's `viewer`
 * block lets the UI hide what would only 403.
 */

export interface AdminOverview {
  stats: Record<string, Record<string, unknown>> & { generated_at?: string };
  config: {
    stripe: { secretKey: boolean; webhookSecret: boolean; mode: string };
    payouts: Array<{ method: string; label: string; configured: boolean; problem: string | null; manual: boolean }>;
    cronSecret: boolean;
    rateLimitBackend: boolean;
    chatModeration: boolean;
    alertWebhook: boolean;
    commit: string | null;
    environment: string;
  };
  viewer: { role: AdminRole; permissions: Permission[] };
}

export function useAdminOverview(enabled = true) {
  return useQuery({
    queryKey: ["/api/admin/overview"],
    enabled,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminOverview> => {
      const res = await fetch("/api/admin/overview", { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const e = new Error((err as { error?: string }).error || "Not authorised") as Error & { status?: number };
        e.status = res.status;
        throw e;
      }
      return res.json();
    },
  });
}

/** Generic paged/filterable GET against an admin endpoint. */
export function useAdminList<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string | number | undefined | null>,
  options: { enabled?: boolean; refetchInterval?: number } = {}
) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).length > 0) search.set(k, String(v));
  }
  const qs = search.toString();
  const url = qs ? `${path}?${qs}` : path;
  return useQuery({
    queryKey: [path, params] as QueryKey,
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval,
    retry: false,
    queryFn: async (): Promise<T> => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `Request failed (${res.status})`);
      }
      return res.json();
    },
  });
}

export function useAdminSearch(q: string) {
  return useQuery({
    queryKey: ["/api/admin/search", q],
    enabled: q.trim().length >= 2,
    retry: false,
    queryFn: async (): Promise<{ hits: Array<{ type: string; id: string; title: string; subtitle?: string; href: string }> }> => {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`, { credentials: "include" });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
  });
}

/**
 * A console mutation. `invalidate` lists query-key prefixes to refresh on
 * success; the server's `error` text is what the toast shows, so a refused
 * action explains itself (permission, MFA, reason, state).
 */
export function useAdminAction<TBody extends object = Record<string, unknown>, TResult = Record<string, unknown>>(
  method: "POST" | "PATCH" | "DELETE",
  buildPath: (body: TBody & { id?: string }) => string,
  options: { invalidate?: string[]; successMessage?: string | ((r: TResult) => string) } = {}
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: TBody & { id?: string }): Promise<TResult> => {
      const { id: _id, ...payload } = body as TBody & { id?: string };
      void _id;
      const res = await apiRequest(method, buildPath(body), payload);
      return res.json();
    },
    onSuccess: (result) => {
      for (const key of options.invalidate ?? []) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      const msg = typeof options.successMessage === "function" ? options.successMessage(result) : options.successMessage;
      if (msg) toast.success(msg);
    },
    onError: (error: Error & { status?: number }) => {
      toast.error(error.message || "Action failed");
    },
  });
}
