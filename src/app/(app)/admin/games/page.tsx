"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, RefreshCw, Users, CheckCircle, Trophy } from "lucide-react";
import { useAdminList, useAdminOverview } from "@/lib/hooks/use-admin";
import { useSyncNFLGames } from "@/lib/hooks/use-sync-nfl";
import { useSyncTeams } from "@/lib/hooks/use-sync-teams";
import { useCompletePools } from "@/lib/hooks/use-complete-pools";
import { AdminPageHeader, AdminTable, ActionButton, FilterTabs, SearchBox, Pager, StatusBadge, DateTime, type Column } from "@/components/admin/ui";

type Game = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  date: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  week: number | null;
  season: number | null;
  period: number | null;
  display_clock: string | null;
  possession: string | null;
  down_distance: string | null;
  data_source: string;
  last_synced_at: string | null;
  pools: number;
};
type Job = { job: string; last_status: string | null; last_started_at: string | null; last_success_at: string | null; last_error: string | null; last_detail: Record<string, unknown> | null };
type Status = "all" | "live" | "scheduled" | "finished" | "disrupted";

export default function AdminGamesPage() {
  const params = useSearchParams();
  const [status, setStatus] = useState<Status>((params.get("status") as Status) || "all");
  const [search, setSearch] = useState(params.get("game") ?? "");
  const [page, setPage] = useState(1);
  const showSync = params.get("view") === "sync";
  const overview = useAdminOverview();
  const canSync = overview.data?.viewer.permissions.includes("games.sync") ?? false;

  const { data, isLoading, error, refetch, isFetching } = useAdminList<{ games: Game[]; total: number; totalPages: number; sync: { source: string; jobs: Job[] } }>(
    "/api/admin/games",
    { status: status === "all" ? undefined : status, search, page, limit: 25 },
    { refetchInterval: status === "live" ? 60_000 : undefined }
  );
  const syncNFL = useSyncNFLGames();
  const syncTeams = useSyncTeams();
  const completePools = useCompletePools();

  const columns: Column<Game>[] = [
    { key: "game", header: "Game", render: (g) => <span className="font-display font-bold">{g.away_team_id} @ {g.home_team_id}</span> },
    { key: "date", header: "Kickoff", render: (g) => <DateTime value={g.date} /> },
    { key: "status", header: "Status", render: (g) => <StatusBadge status={g.status} /> },
    { key: "score", header: "Score", render: (g) => <span className="font-mono">{g.away_score ?? "–"} : {g.home_score ?? "–"}</span> },
    { key: "q", header: "Quarter / clock", render: (g) => (g.status === "live" ? <span className="font-mono text-xs">{g.period ? `Q${g.period}` : "—"} {g.display_clock ?? ""}{g.down_distance ? ` · ${g.down_distance}` : ""}{g.possession ? ` · 🏈 ${g.possession}` : ""}</span> : "—"), secondary: true },
    { key: "week", header: "Week", render: (g) => `${g.season ?? ""} wk ${g.week ?? "?"}`, secondary: true },
    { key: "pools", header: "Pools", render: (g) => g.pools, secondary: true },
    { key: "source", header: "Source", render: (g) => <span className="text-xs">{g.data_source}</span>, secondary: true },
    { key: "sync", header: "Last sync", render: (g) => <DateTime value={g.last_synced_at} /> },
  ];

  const jobs = data?.sync.jobs ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Games"
        description={`Scores and live state from ${data?.sync.source ?? "ESPN"}. The settle job refreshes every 30 minutes; use the controls to sync now.`}
        icon={<CalendarDays className="w-8 h-8" />}
        actions={
          canSync ? (
            <>
              <ActionButton tone="primary" onClick={() => syncNFL.mutate({})} disabled={syncNFL.isPending}><RefreshCw className={`w-3.5 h-3.5 inline mr-1 ${syncNFL.isPending ? "animate-spin" : ""}`} />Sync games now</ActionButton>
              <ActionButton onClick={() => syncNFL.mutate({ createWeeklyPublicPool: true, entryFee: 20 })} disabled={syncNFL.isPending} title="Syncs this week and creates the featured public pool if missing"><Trophy className="w-3.5 h-3.5 inline mr-1" />Sync + weekly pool</ActionButton>
              <ActionButton onClick={() => syncTeams.mutate()} disabled={syncTeams.isPending}><Users className="w-3.5 h-3.5 inline mr-1" />Sync teams</ActionButton>
              <ActionButton onClick={() => completePools.mutate()} disabled={completePools.isPending}><CheckCircle className="w-3.5 h-3.5 inline mr-1" />Complete finished pools</ActionButton>
            </>
          ) : undefined
        }
      />

      <div className="glass-panel rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Synchronisation status</h2>
          <button type="button" onClick={() => refetch()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} /> refresh</button>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scheduled job has reported yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {jobs.map((j) => (
              <div key={j.job} className={`rounded-lg border p-3 text-sm space-y-1 ${j.last_status === "error" ? "border-red-500/40" : "border-white/10"}`}>
                <div className="flex items-center justify-between"><span className="font-mono uppercase">{j.job}</span><StatusBadge status={j.last_status ?? "unknown"} /></div>
                <p className="text-xs text-muted-foreground">Started <DateTime value={j.last_started_at} /></p>
                <p className="text-xs text-muted-foreground">Last success <DateTime value={j.last_success_at} /></p>
                {j.last_error && <p className="text-xs text-red-300 break-words">{j.last_error}</p>}
                {j.last_detail && <p className="text-[11px] text-muted-foreground break-words">{JSON.stringify(j.last_detail)}</p>}
              </div>
            ))}
          </div>
        )}
        {showSync && <p className="text-xs text-muted-foreground mt-3">Retry a failed sync with “Sync games now”. Disrupted games (postponed / cancelled) are listed under the Disrupted filter and count as a correct pick for everyone at settlement.</p>}
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <FilterTabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: "All" }, { value: "live", label: "Live" }, { value: "scheduled", label: "Upcoming" }, { value: "finished", label: "Completed" }, { value: "disrupted", label: "Disrupted" }]} />
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Team abbreviation or game id" />
      </div>
      <AdminTable columns={columns} rows={data?.games ?? []} isLoading={isLoading} error={error?.message ?? null} onRetry={() => refetch()} emptyTitle="No games match" />
      <Pager page={page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
