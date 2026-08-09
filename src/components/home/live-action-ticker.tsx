"use client";

import { useGames } from "@/lib/hooks/use-games";
import { useMemo } from "react";

// Minimal shape of the API game rows this ticker reads.
type TickerGame = {
  id: string;
  date: string;
  status?: string;
  odds?: string | null;
  homeTeamId?: string;
  awayTeamId?: string;
  home_team?: { name?: string } | null;
  away_team?: { name?: string } | null;
};

export function LiveActionTicker() {
  const { data: gamesData, isLoading } = useGames();

  const upcomingGames = useMemo(() => {
    const games = (gamesData?.games || []) as TickerGame[];
    return games
      .filter((game) => game.status === "scheduled" || game.status === "upcoming")
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 3);
  }, [gamesData]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="glass-panel p-4 rounded-xl flex items-center justify-between animate-pulse"
          >
            <div className="flex flex-col gap-2">
              <div className="h-3 w-16 bg-white/10 rounded"></div>
              <div className="h-5 w-24 bg-white/10 rounded"></div>
            </div>
            <div className="h-6 w-12 bg-white/10 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (upcomingGames.length === 0) {
    return null; // Don't show if no upcoming games
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {upcomingGames.map((game) => {
        // Get team abbreviations from game data
        const homeName = game.home_team?.name || game.homeTeamId || "TBD";
        const awayName = game.away_team?.name || game.awayTeamId || "TBD";
        const odds = game.odds || "TBD";

        return (
          <div
            key={game.id}
            className="glass-panel p-4 rounded-xl flex items-center justify-between gap-3 transition-all duration-300 hover:border-primary/30 hover:-translate-y-0.5"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-muted-foreground font-mono uppercase">
                Upcoming
              </span>
              <span className="font-bold font-display text-lg truncate">
                {homeName} vs {awayName}
              </span>
            </div>
            <div className="bg-black/30 px-3 py-1 rounded text-xs font-mono text-primary border border-primary/20 shrink-0">
              {odds}
            </div>
          </div>
        );
      })}
    </div>
  );
}
