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

export default function DashboardPage() {
  const { data: poolsData } = usePools({ limit: 100 });
  const allPools = poolsData?.pools ?? [];
  const { data: gamesData } = useGames(undefined, undefined);
  const games = (gamesData?.games || []) as any[];

  const featuredPools = useMemo(() => {
    return allPools.filter((p: any) => p.type === PoolType.PUBLIC).slice(0, 2);
  }, [allPools]);

  const featuredPool = useMemo(() => {
    const publicPools = allPools.filter((p: any) => p.type === PoolType.PUBLIC);
    if (publicPools.length === 0) return null;
    return publicPools.reduce((best: any, p: any) => {
      const pot = p.prize_pot ?? p.prizePot ?? 0;
      const bestPot = best.prize_pot ?? best.prizePot ?? 0;
      return pot >= bestPot ? p : best;
    }, publicPools[0]);
  }, [allPools]);

  const yourPools = useMemo(() => {
    return allPools.filter((p: any) => p.type === PoolType.PRIVATE);
  }, [allPools]);

  const groupedGames = useMemo(() => {
    return games.reduce((acc: any, game: any) => {
      const dateKey = format(new Date(game.date), "yyyy-MM-dd");
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(game);
      return acc;
    }, {} as Record<string, any[]>);
  }, [games]);

  const sortedDates = Object.keys(groupedGames).sort();

  return (
    <Layout>
      <div className="space-y-8">
        <HeroSection featuredPool={featuredPool} />
        <LiveActionTicker />
        <WinnersSection />
        <FeaturedPoolsSection pools={featuredPools} />
        <NFLScheduleSection
          groupedGames={groupedGames}
          sortedDates={sortedDates}
        />
        <YourActivePoolsSection pools={yourPools} />
      </div>
    </Layout>
  );
}
