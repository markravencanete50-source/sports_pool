"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Users } from "lucide-react";
import { useAdminList } from "@/lib/hooks/use-admin";
import { AdminPageHeader, AdminTable, FilterTabs, SearchBox, Pager, StatusBadge, Money, DateTime, type Column } from "@/components/admin/ui";

type Row = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  admin_role: string | null;
  account_status: string;
  balance: number;
  created_at: string;
  last_active_at: string | null;
  age_verified: boolean;
  age_review_status: string;
  poolsJoined: number;
  poolsCreated: number;
  deposits: number;
  winnings: number;
  withdrawals: number;
};

type Filter = "all" | "active" | "blocked" | "suspended" | "review" | "verified" | "unverified";

export default function AdminUsersPage() {
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>((params.get("status") as Filter) || (params.get("review") ? "review" : "all"));
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = {
    page,
    limit: 25,
    search: debounced,
    status: ["active", "blocked", "suspended"].includes(filter) ? filter : undefined,
    review: filter === "review" ? "pending" : undefined,
    verified: filter === "verified" ? "yes" : filter === "unverified" ? "no" : undefined,
  };
  const { data, isLoading, error, refetch } = useAdminList<{ users: Row[]; total: number; totalPages: number }>("/api/admin/users", query);

  const columns: Column<Row>[] = [
    {
      key: "user",
      header: "User",
      render: (u) => (
        <span className="block">
          <span className="block font-medium">{u.name ?? "—"}</span>
          <span className="block text-xs text-muted-foreground">{u.email}</span>
        </span>
      ),
    },
    { key: "joined", header: "Registered", render: (u) => <DateTime value={u.created_at} />, secondary: true },
    {
      key: "status",
      header: "Status",
      render: (u) => (
        <span className="flex flex-wrap gap-1">
          <StatusBadge status={u.account_status} />
          {u.role === "admin" && <StatusBadge status={u.admin_role ?? "super_admin"} />}
        </span>
      ),
    },
    {
      key: "age",
      header: "Age",
      render: (u) => (
        <span className="flex gap-1">
          <StatusBadge status={u.age_verified ? "verified" : "unverified"} />
          {u.age_review_status !== "none" && <StatusBadge status={u.age_review_status} />}
        </span>
      ),
      secondary: true,
    },
    { key: "balance", header: "Balance", render: (u) => <Money value={u.balance} /> },
    { key: "pools", header: "Pools (joined / created)", render: (u) => `${u.poolsJoined} / ${u.poolsCreated}`, secondary: true },
    { key: "deposits", header: "Deposits", render: (u) => <Money value={u.deposits} />, secondary: true },
    { key: "withdrawals", header: "Withdrawals", render: (u) => <Money value={u.withdrawals} />, secondary: true },
    { key: "winnings", header: "Winnings", render: (u) => <Money value={u.winnings} />, secondary: true },
    { key: "active", header: "Last active", render: (u) => <DateTime value={u.last_active_at} />, secondary: true },
  ];

  return (
    <div>
      <AdminPageHeader title="Users" description="Every registered account, with standing, verification and money at a glance." icon={<Users className="w-8 h-8" />} />
      <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between mb-4">
        <FilterTabs
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "blocked", label: "Blocked" },
            { value: "suspended", label: "Suspended" },
            { value: "review", label: "Age review" },
            { value: "verified", label: "Verified" },
            { value: "unverified", label: "Unverified" },
          ]}
        />
        <SearchBox value={search} onChange={setSearch} placeholder="Name, email or user id" />
      </div>
      <AdminTable
        columns={columns}
        rows={data?.users ?? []}
        rowHref={(u) => `/admin/users/${u.id}`}
        isLoading={isLoading}
        error={error?.message ?? null}
        onRetry={() => refetch()}
        emptyTitle="No users match"
        emptyDescription="Try another filter or search term."
      />
      <Pager page={page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
