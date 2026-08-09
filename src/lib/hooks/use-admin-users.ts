"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import type {
  UserRole,
  UseAdminUsersParams,
  AdminUsersResult,
} from "@/lib/types";

export type { UserRole, AdminUser, UseAdminUsersParams, AdminUsersResult } from "@/lib/types";

export function useAdminUsers(params: UseAdminUsersParams = {}) {
  const { page = 1, limit = 20, search = "" } = params;
  const queryKey = ["/api/admin/users", page, limit, search];

  return useQuery({
    queryKey,
    queryFn: async (): Promise<AdminUsersResult> => {
      const urlParams = new URLSearchParams();
      urlParams.set("page", String(page));
      urlParams.set("limit", String(limit));
      if (search.trim()) urlParams.set("search", search.trim());
      const res = await apiRequest(
        "GET",
        `/api/admin/users?${urlParams.toString()}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to fetch users");
      }
      const data = await res.json();
      return {
        users: data.users ?? [],
        total: data.total ?? 0,
        page: data.page ?? page,
        limit: data.limit ?? limit,
        totalPages: data.totalPages ?? Math.max(1, Math.ceil((data.total ?? 0) / limit)),
      };
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      role,
    }: {
      userId: string;
      role: UserRole;
    }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/role`, {
        role,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to update role");
      }
      return res.json();
    },
    onSuccess: (_, { role }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast.success(`Role set to ${role}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
