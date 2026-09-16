"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Trophy } from "lucide-react";
import { useAdminList, useAdminOverview } from "@/lib/hooks/use-admin";
import { useSyncNFLGames } from "@/lib/hooks/use-sync-nfl";
import { AdminPageHeader, AdminTable, ActionButton, FilterTabs, SearchBox, Pager, StatusBadge, Money, DateTime, useConfirm, type Column } from "@/components/admin/ui";

type Row = {
  id: string;
  name: string;
  type: string;
  sport: string;
  status: string;
  entry_fee: number;
  participants: number;
  prize_pot: number;
  platform_fee: number;
  starts_at: string | null;
  ends_at: string | null;
  week: number;
  games: number;
  owner: { id?: string; name?: string | null; email?: string | null } | null;
  winners: Array<{ user_id: string; name: string | null; amount: number }>;
  created_at: string;
};

type Status = "all" | "open" | "active" | "paused" | "completed" | "cancelled";
type Type = "all" | "public" | "private";

export default function AdminPoolsPage() {
  const params = useSearchParams();
  const [status, setStatus] = useState<Status>((params.get("status") as Status) || "all");
  const [type, setType] = useState<Type>((params.get("type") as Type) || "all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const overview = useAdminOverview();
  const canCreateOfficial = overview.data?.viewer.permissions.includes("games.sync") ?? false;
  const createOfficial = useSyncNFLGames();
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error, refetch } = useAdminList<{ pools: Row[]; total: number; totalPages: number }>("/api/admin/pools", {
    status: status === "all" ? undefined : status,
    type: type === "all" ? undefined : type,
    search: debounced,
    page,
    limit: 25,
  });

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Pool",
      render: (p) => (
        <span className="block">
          <span className="block font-medium">{p.name}</span>
          <span className="block text-xs text-muted-foreground">{p.sport.toUpperCase()} wk {p.week} · {p.games} games</span>
        </span>
      ),
    },
    { key: "owner", header: "Owner", render: (p) => <span className="text-xs">{p.owner?.name ?? "—"}<br /><span className="text-muted-foreground">{p.owner?.email ?? ""}</span></span>, secondary: true },
    { key: "type", header: "Type", render: (p) => <StatusBadge status={p.type} />, secondary: true },
    { key: "fee", header: "Entry", render: (p) => <Money value={p.entry_fee} /> },
    { key: "players", header: "Players", render: (p) => p.participants, secondary: true },
    { key: "pot", header: "Prize pot", render: (p) => <Money value={p.prize_pot} /> },
    { key: "platform", header: "Platform fee", render: (p) => <Money value={p.platform_fee} />, secondary: true },
    { key: "window", header: "Window", render: (p) => (p.starts_at || p.ends_at ? <span className="text-xs"><DateTime value={p.starts_at} /> → <DateTime value={p.ends_at} /></span> : <span className="text-xs text-muted-foreground">week slate</span>), secondary: true },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
    { key: "winner", header: "Winner", render: (p) => (p.winners.length ? <span className="text-xs">{p.winners.map((w) => `${w.name ?? w.user_id.slice(0, 6)} ($${w.amount.toFixed(0)})`).join(", ")}</span> : "—"), secondary: true },
    { key: "created", header: "Created", render: (p) => <DateTime value={p.created_at} />, secondary: true },
  ];

  return (
    <div>
      {dialog}
      <AdminPageHeader
        title="Pools"
        description="Every pool on the platform. Create the official weekly pool here, or open one to manage it."
        icon={<Trophy className="w-8 h-8" />}
        actions={canCreateOfficial ? (
          <ActionButton
            tone="primary"
            disabled={createOfficial.isPending}
            onClick={() => confirm({
              title: "Create official weekly pool",
              description: "Syncs the selected NFL week and creates one public platform pool. If that season and week already exists, it will not create a duplicate.",
              confirmLabel: "Create official pool",
              fields: [
                { name: "poolName", label: "Pool name (optional)", placeholder: "NFL Week … Public Pool" },
                { name: "season", label: "Season (blank = current)", type: "number", min: 2000, max: 2100 },
                { name: "week", label: "Week (blank = current)", type: "number", min: 1, max: 25 },
                { name: "entryFee", label: "Entry fee in USD (blank = 20)", type: "number", min: 20, max: 10000 },
              ],
              onConfirm: ({ reason, poolName, season, week, entryFee }) => createOfficial.mutateAsync({
                createWeeklyPublicPool: true,
                reason,
                poolName: poolName?.trim() || undefined,
                season: season ? Number(season) : undefined,
                week: week ? Number(week) : undefined,
                entryFee: entryFee ? Number(entryFee) : 20,
              }),
            })}
          >
            <Plus className="w-3.5 h-3.5 inline mr-1" />Create Official Pool
          </ActionButton>
        ) : undefined}
      />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <div className="flex flex-wrap gap-2">
          <FilterTabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: "All" }, { value: "open", label: "Upcoming" }, { value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled" }]} />
          <FilterTabs value={type} onChange={(v) => { setType(v); setPage(1); }} options={[{ value: "all", label: "Any" }, { value: "public", label: "Public" }, { value: "private", label: "Private" }]} />
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="Pool name or id" />
      </div>
      <AdminTable columns={columns} rows={data?.pools ?? []} rowHref={(p) => `/admin/pools/${p.id}`} isLoading={isLoading} error={error?.message ?? null} onRetry={() => refetch()} emptyTitle="No pools match" />
      <Pager page={page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
