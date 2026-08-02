"use client";

import Layout from "@/components/layout";
import { useAuth } from "@/lib/hooks/use-auth";
import { useRouter } from "next/navigation";
import { DASHBOARD_PATH } from "@/lib/routes";
import { useEffect } from "react";
import {
  Loader2,
  RefreshCw,
  Database,
  CheckCircle,
  Users,
  Trophy,
} from "lucide-react";
import { useSyncNFLGames } from "@/lib/hooks/use-sync-nfl";
import { useSyncTeams } from "@/lib/hooks/use-sync-teams";
import { useCompletePools } from "@/lib/hooks/use-complete-pools";
import { usePools } from "@/lib/hooks/use-pools";
import Link from "next/link";

export default function AdminGamesPage() {
  const router = useRouter();
  const { user, isLoadingUser } = useAuth();
  const syncNFLMutation = useSyncNFLGames();
  const syncTeamsMutation = useSyncTeams();
  const completePoolsMutation = useCompletePools();
  const { data: poolsData } = usePools({ limit: 100 });
  const openPools = (poolsData?.pools ?? []).filter(
    (p: any) => p.status === "open" || p.status === "active",
  );

  const isAdmin =
    (user as any)?.app_metadata?.role === "admin" ||
    (user as any)?.role === "admin";

  useEffect(() => {
    if (!isLoadingUser && !isAdmin && user !== undefined) {
      router.replace(DASHBOARD_PATH);
    }
  }, [isLoadingUser, isAdmin, user, router]);

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
        <div>
          <h1 className="text-4xl font-black font-display italic uppercase mb-2 flex items-center gap-2">
            <Database className="w-10 h-10 text-primary" />
            Games & Pools
          </h1>
          <p className="text-muted-foreground">
            Sync NFL games, update pool scores, and mark pools completed.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="glass-panel p-6 rounded-xl space-y-4">
            <h2 className="text-xl font-bold font-display uppercase flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              NFL Teams Sync
            </h2>
            <p className="text-sm text-muted-foreground">
              sync 32 NFL teams from ESPN (names, logos, colors).
            </p>
            <button
              type="button"
              onClick={() => syncTeamsMutation.mutate()}
              disabled={syncTeamsMutation.isPending}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {syncTeamsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Sync NFL Teams
            </button>
          </div>

          <div className="glass-panel p-6 rounded-xl space-y-4">
            <h2 className="text-xl font-bold font-display uppercase flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              NFL Games Sync
            </h2>
            <p className="text-sm text-muted-foreground">
              Fetch and sync NFL games from ESPN.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => syncNFLMutation.mutate({})}
                disabled={syncNFLMutation.isPending}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {syncNFLMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Sync NFL Games
              </button>
              <button
                type="button"
                onClick={() =>
                  syncNFLMutation.mutate({
                    createWeeklyPublicPool: true,
                    entryFee: 20,
                  })
                }
                disabled={syncNFLMutation.isPending}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary/80 text-primary-foreground font-medium hover:bg-primary/70 disabled:opacity-50 border border-primary/50"
              >
                {syncNFLMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trophy className="w-4 h-4" />
                )}
                Sync & Create Weekly Public Pool
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              &quot;Sync & Create Weekly Public Pool&quot; syncs the current
              week&apos;s games and creates the main public pool only if one
              doesn&apos;t already exist for this week ($20, 6–9 games).
            </p>
          </div>

          <div className="glass-panel p-6 rounded-xl space-y-4">
            <h2 className="text-xl font-bold font-display uppercase flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-primary" />
              Complete Finished Pools
            </h2>
            <p className="text-sm text-muted-foreground">
              Mark pools as completed when all their games are finished or
              disrupted. Checks all open/active pools.
            </p>
            <button
              type="button"
              onClick={() => completePoolsMutation.mutate()}
              disabled={completePoolsMutation.isPending}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {completePoolsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Complete Finished Pools
            </button>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-xl">
          <h2 className="text-xl font-bold font-display uppercase mb-4 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            Sync Pool Scores ({openPools.length} open pools)
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Sync game scores for a specific pool. Visit each pool and use the
            &quot;Sync scores&quot; button on the pool detail page.
          </p>
          {openPools.length === 0 ? (
            <p className="text-muted-foreground italic">
              No open pools. All pools are either completed or not yet started.
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {openPools.slice(0, 20).map((pool: any) => (
                <Link
                  key={pool.id}
                  href={`/pool/${pool.id}`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 border border-white/5"
                >
                  <span className="font-medium truncate">{pool.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    Week {pool.week}
                  </span>
                </Link>
              ))}
              {openPools.length > 20 && (
                <p className="text-xs text-muted-foreground pt-2">
                  +{openPools.length - 20} more pools
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
