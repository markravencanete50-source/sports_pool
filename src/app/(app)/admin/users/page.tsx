"use client";

import Layout from "@/components/layout";
import {
  useAdminUsers,
  useUpdateUserRole,
  type UserRole,
} from "@/lib/hooks/use-admin-users";
import { useAuth } from "@/lib/hooks/use-auth";
import { useRouter } from "next/navigation";
import { DASHBOARD_PATH } from "@/lib/routes";
import { useState, useEffect } from "react";
import { Loader2, Search, Users } from "lucide-react";
import { Pagination } from "@/components/pools/pagination";

const PAGE_SIZE = 20;

type AuthUser = {
  id?: string;
  role?: string | null;
  app_metadata?: { role?: string | null };
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { user: authUser, isLoadingUser } = useAuth();
  const user = authUser as AuthUser | null | undefined;
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      // Reset pagination alongside the debounced search update (async, so it
      // does not run synchronously within the effect body).
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const isAdmin =
    user?.app_metadata?.role === "admin" ||
    user?.role === "admin";
  useEffect(() => {
    if (!isLoadingUser && !isAdmin && user !== undefined) {
      router.replace(DASHBOARD_PATH);
    }
  }, [isLoadingUser, isAdmin, user, router]);

  const { data, isLoading, error } = useAdminUsers({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch,
  });
  const updateRoleMutation = useUpdateUserRole();

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  if (isLoadingUser || (!isAdmin && user !== undefined)) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-4xl font-black font-display italic uppercase mb-2 flex items-center gap-2">
              <Users className="w-10 h-10 text-primary" />
              Users
            </h1>
            <p className="text-muted-foreground">
              Manage and view all registered users.
            </p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {error ? (
          <div className="text-center py-12">
            <p className="text-destructive">
              {(error as Error).message}
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-white/10 overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                      Email
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                      Name
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                      Role
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-12 text-center text-muted-foreground"
                      >
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const currentRole = (u.role === "admin" ? "admin" : "user") as UserRole;
                      const isUpdating =
                        updateRoleMutation.isPending &&
                        (updateRoleMutation.variables as { userId: string })?.userId === u.id;
                      const isSelf = user?.id === u.id;
                      return (
                        <tr
                          key={u.id}
                          className="border-b border-white/5 hover:bg-white/5"
                        >
                          <td className="px-4 py-3 text-sm">{u.email}</td>
                          <td className="px-4 py-3 text-sm">
                            {u.name ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={currentRole}
                              onChange={(e) => {
                                const role = e.target.value as UserRole;
                                if (role === currentRole) return;
                                if (isSelf && role === "user") return;
                                updateRoleMutation.mutate({ userId: u.id, role });
                              }}
                              disabled={isUpdating || (isSelf && currentRole === "admin")}
                              className="bg-black/20 border border-white/10 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                            {isUpdating && (
                              <Loader2 className="inline-block w-4 h-4 ml-2 animate-spin text-primary" />
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {u.created_at
                              ? new Date(u.created_at).toLocaleDateString()
                              : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={PAGE_SIZE}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          </>
        )}
      </div>
    </Layout>
  );
}
