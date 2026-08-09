"use client";

import Layout from "@/components/layout";
import { format } from "date-fns";
import { HeroSection } from "@/components/home/hero-section";
import { LiveActionTicker } from "@/components/home/live-action-ticker";
import { WinnersSection } from "@/components/home/winners-section";
import { FeaturedPoolsSection } from "@/components/home/featured-pools-section";
import { NFLScheduleSection } from "@/components/home/nfl-schedule-section";
import { YourActivePoolsSection } from "@/components/home/your-active-pools-section";
import { usePools } from "@/lib/hooks/use-pools";
import { useGames } from "@/lib/hooks/use-games";
import { useMemo } from "react";
import { PoolType } from "@/lib/enums";
import type { Pool } from "@/lib/types";

type ScheduleGame = { id: string; date: string };

function PoolGridSkeleton({ cards }: { cards: number }) {
  return (
    <section aria-hidden="true">
      <div className="skeleton h-8 w-56 mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="skeleton h-52" />
        ))}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { data: poolsData, isLoading: isLoadingPools } = usePools({
    limit: 100,
  });
  const allPools = useMemo<Pool[]>(() => poolsData?.pools ?? [], [poolsData]);
  const { data: gamesData } = useGames(undefined, undefined);
  const games = useMemo<ScheduleGame[]>(
    () => gamesData?.games || [],
    [gamesData]
  );

  const featuredPools = useMemo(() => {
    return allPools.filter((p) => p.type === PoolType.PUBLIC).slice(0, 2);
  }, [allPools]);

  const featuredPool = useMemo(() => {
    const publicPools = allPools.filter((p) => p.type === PoolType.PUBLIC);
    if (publicPools.length === 0) return null;
    return publicPools.reduce((best, p) => {
      const pot = p.prize_pot ?? p.prizePot ?? 0;
      const bestPot = best.prize_pot ?? best.prizePot ?? 0;
      return pot >= bestPot ? p : best;
    }, publicPools[0]);
  }, [allPools]);

  const yourPools = useMemo(() => {
    return allPools.filter((p) => p.type === PoolType.PRIVATE);
  }, [allPools]);

  const groupedGames = useMemo(() => {
    return games.reduce<Record<string, ScheduleGame[]>>((acc, game) => {
      const dateKey = format(new Date(game.date), "yyyy-MM-dd");
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(game);
      return acc;
    }, {});
  }, [games]);

  const sortedDates = Object.keys(groupedGames).sort();

  return (
    <Layout>
      <div className="space-y-8">
        <HeroSection featuredPool={featuredPool} />
        <LiveActionTicker />
        <WinnersSection />
        {isLoadingPools ? (
          <PoolGridSkeleton cards={2} />
        ) : (
          <FeaturedPoolsSection pools={featuredPools} />
        )}
        <NFLScheduleSection
          groupedGames={groupedGames}
          sortedDates={sortedDates}
        />
        {isLoadingPools ? (
          <PoolGridSkeleton cards={3} />
        ) : (
          <YourActivePoolsSection pools={yourPools} />
        )}
      </div>
    </Layout>
  );
}
