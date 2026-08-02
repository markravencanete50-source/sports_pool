"use client";

import { Calendar, Loader2 } from "lucide-react";
import { GameSelectionDateHeader } from "./game-selection-date-header";
import { GameSelectionItem } from "./game-selection-item";
import { GameSelectionSectionProps } from "@/lib/interfaces";
import { poolConfig } from "@/lib/config";
import { GamePrediction } from "@/lib/enums";

export function GameSelectionSection({
  groupedGames,
  sortedDates,
  selectedGames,
  myPicks,
  onToggleGameSelection,
  onTogglePick,
  onTogglePrediction,
  dateRange,
  onDateRangeChange,
  isLoadingGames = false,
  gamesError = null,
  pickEnabled = true,
}: GameSelectionSectionProps) {
  const totalGames = Object.values(groupedGames).flat().length;

  return (
    <div className="space-y-6 pt-4 border-t border-white/10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-lg font-bold font-display flex items-center gap-2 mb-1">
            <Calendar className="w-5 h-5 text-primary" /> Select Games
          </h3>
          <p className="text-xs text-muted-foreground">
            Select {poolConfig.minGames}-{poolConfig.maxGames} games for your
            pool
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-black/30 rounded-lg p-1 border border-white/10">
            <button
              onClick={() => onDateRangeChange("upcoming")}
              disabled={isLoadingGames}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-50 ${
                dateRange === "upcoming"
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => onDateRangeChange("all")}
              disabled={isLoadingGames}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-50 ${
                dateRange === "all"
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Future
            </button>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              {selectedGames.length}
            </div>
            <div className="text-xs text-muted-foreground">selected</div>
          </div>
        </div>
      </div>

      {isLoadingGames ? (
        <div className="flex items-center justify-center py-12 bg-white/5 rounded-xl border border-white/10">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : gamesError ? (
        <div className="text-center py-12 bg-destructive/10 rounded-xl border border-destructive/30">
          <p className="text-destructive mb-2">Failed to load games</p>
          <p className="text-sm text-muted-foreground">
            {(gamesError as Error).message || "Unable to fetch NFL schedule"}
          </p>
        </div>
      ) : totalGames === 0 ? (
        <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
          <p className="text-muted-foreground mb-2">No games available</p>
          <p className="text-sm text-muted-foreground">
            Check back later for new games
          </p>
        </div>
      ) : (
        <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
          {sortedDates.map((dateKey) => {
            const games = groupedGames[dateKey];
            if (!games || games.length === 0) return null;

            return (
              <div key={dateKey} className="space-y-3">
                <GameSelectionDateHeader
                  date={new Date(games[0].date)}
                  gameCount={games.length}
                />

                <div className="grid grid-cols-1 gap-3">
                  {games.map((game) => {
                    const isSelected = selectedGames.includes(game.id);
                    const myPick = myPicks[game.id];
                    const selectedPrediction =
                      typeof myPick === "string" &&
                      (myPick === GamePrediction.HOME_WIN ||
                        myPick === GamePrediction.AWAY_WIN ||
                        myPick === GamePrediction.TIE)
                        ? (myPick as GamePrediction)
                        : undefined;
                    const selectedTeamId = selectedPrediction
                      ? undefined
                      : (myPick as string | undefined);
                    const totalScorePrediction = myPicks[
                      `${game.id}_totalScore`
                    ]
                      ? parseInt(myPicks[`${game.id}_totalScore`] as string)
                      : undefined;

                    return (
                      <GameSelectionItem
                        key={game.id}
                        game={game}
                        isSelected={isSelected}
                        selectedTeamId={selectedTeamId}
                        selectedPrediction={selectedPrediction}
                        totalScorePrediction={totalScorePrediction}
                        onToggleSelection={() => onToggleGameSelection(game.id)}
                        onPickTeam={(teamId) => onTogglePick(game.id, teamId)}
                        onPickPrediction={
                          onTogglePrediction
                            ? (prediction, totalScore) =>
                                onTogglePrediction(
                                  game.id,
                                  prediction,
                                  totalScore
                                )
                            : undefined
                        }
                        pickEnabled={pickEnabled}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedGames.length === 0 && totalGames > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <p className="text-xs text-yellow-500 text-center font-medium">
            ⚠️ Please select {poolConfig.minGames}-{poolConfig.maxGames} games
            to create your pool
          </p>
        </div>
      )}
      {selectedGames.length > 0 &&
        selectedGames.length < poolConfig.minGames && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
            <p className="text-xs text-yellow-500 text-center font-medium">
              Select {poolConfig.minGames - selectedGames.length} more game
              {poolConfig.minGames - selectedGames.length > 1 ? "s" : ""}{" "}
              (minimum {poolConfig.minGames} required)
            </p>
          </div>
        )}
      {selectedGames.length >= poolConfig.maxGames && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
          <p className="text-xs text-green-500 text-center font-medium">
            ✓ Maximum games selected ({poolConfig.maxGames}/
            {poolConfig.maxGames})
          </p>
        </div>
      )}
    </div>
  );
}
