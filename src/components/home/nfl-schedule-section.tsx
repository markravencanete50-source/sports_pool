"use client";

import { Calendar, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { GameDateHeader } from "./game-date-header";
import { ScheduleGameCard } from "./schedule-game-card";
import { useState, useMemo } from "react";
import {
  format,
  addDays,
  startOfWeek,
  endOfWeek,
  isSameDay,
  parseISO,
  getWeek,
} from "date-fns";
import { useGames } from "@/lib/hooks/use-games";

import { FilterType, ViewType } from "@/lib/types";
import { NFLScheduleSectionProps } from "@/lib/interfaces";

export function NFLScheduleSection({
  groupedGames: initialGroupedGames,
  sortedDates: initialSortedDates,
}: NFLScheduleSectionProps) {
  const [filterType, setFilterType] = useState<FilterType>("upcoming");
  const [viewType, setViewType] = useState<ViewType>("week");
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: 1 });

  const { data: apiGamesData, isLoading } = useGames(undefined, undefined);
  const apiGames = (apiGamesData?.games || []) as any[];
  const gamesToUse =
    apiGames.length > 0 ? apiGames : Object.values(initialGroupedGames).flat();

  const filteredGames = useMemo(() => {
    const now = new Date();
    let games: any[] = [...gamesToUse];

    if (filterType === "upcoming") {
      games = games.filter((g: any) => {
        const status = g.status || "scheduled";
        const gameDate = new Date(g.date);
        const notPlayed = status !== "finished";
        return notPlayed && (gameDate >= now || status === "live");
      });
    } else if (filterType === "live") {
      games = games.filter((g: any) => (g.status || "") === "live");
    } else if (filterType === "finished") {
      games = games.filter((g: any) => (g.status || "") === "finished");
    }

    if (selectedTeam) {
      games = games.filter(
        (g: any) =>
          g.home_team_id === selectedTeam ||
          g.away_team_id === selectedTeam ||
          g.homeTeamId === selectedTeam ||
          g.awayTeamId === selectedTeam
      );
    }

    if (viewType === "week") {
      games = games.filter((g: any) => {
        const gameDate = parseISO(g.date);
        return gameDate >= weekStart && gameDate <= weekEnd;
      });
    }

    games.sort(
      (a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const regrouped: Record<string, any[]> = {};
    games.forEach((game: any) => {
      const dateKey = format(parseISO(game.date), "yyyy-MM-dd");
      if (!regrouped[dateKey]) regrouped[dateKey] = [];
      regrouped[dateKey].push(game);
    });
    return regrouped;
  }, [gamesToUse, filterType, selectedTeam, viewType, weekStart, weekEnd]);

  const filteredDates = Object.keys(filteredGames).sort();

  const allTeams = useMemo(() => {
    const teams = new Set<string>();
    gamesToUse.forEach((game: any) => {
      if (game.home_team_id) teams.add(game.home_team_id);
      if (game.away_team_id) teams.add(game.away_team_id);
      if (game.homeTeamId) teams.add(game.homeTeamId);
      if (game.awayTeamId) teams.add(game.awayTeamId);
    });
    return Array.from(teams).sort();
  }, [gamesToUse]);

  const navigateWeek = (direction: "prev" | "next") => {
    setSelectedWeek((prev) => addDays(prev, direction === "next" ? 7 : -7));
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="w-6 h-6 text-primary" />
          NFL Schedule
        </h2>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status Filter */}
          <div className="flex items-center gap-2 bg-black/30 rounded-lg p-1 border border-white/10">
            {(["all", "upcoming", "live", "finished"] as FilterType[]).map(
              (type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                    filterType === type
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              )
            )}
          </div>

          {/* View Type */}
          <div className="flex items-center gap-2 bg-black/30 rounded-lg p-1 border border-white/10">
            <button
              onClick={() => setViewType("week")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                viewType === "week"
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewType("month")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                viewType === "month"
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Month
            </button>
          </div>

          {/* Team Filter */}
          {allTeams.length > 0 && (
            <select
              value={selectedTeam || ""}
              onChange={(e) => setSelectedTeam(e.target.value || null)}
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Teams</option>
              {allTeams.map((teamId) => (
                <option key={teamId} value={teamId}>
                  {teamId}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Week Navigation */}
      {viewType === "week" && (
        <div className="flex items-center justify-between mb-6 glass-panel p-3 rounded-lg">
          <button
            onClick={() => navigateWeek("prev")}
            className="p-2 hover:bg-white/10 rounded transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <div className="font-bold">
              {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
            </div>
            <button
              onClick={() => setSelectedWeek(new Date())}
              className="text-xs text-primary hover:underline mt-1"
            >
              Today
            </button>
          </div>
          <button
            onClick={() => navigateWeek("next")}
            className="p-2 hover:bg-white/10 rounded transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Games List */}
      {isLoading ? (
        <div className="text-center py-12 glass-panel rounded-xl">
          <p className="text-muted-foreground mb-2">Loading games...</p>
        </div>
      ) : filteredDates.length === 0 ? (
        <div className="text-center py-12 glass-panel rounded-xl">
          <p className="text-muted-foreground mb-2">No games found</p>
          <p className="text-sm text-muted-foreground">
            Try adjusting your filters or selecting a different week
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {filteredDates.map((dateKey) => {
            const games = filteredGames[dateKey];
            return (
              <div key={dateKey} className="space-y-4">
                <GameDateHeader date={parseISO(dateKey)} />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {games.map((game) => (
                    <ScheduleGameCard key={game.id} game={game} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
