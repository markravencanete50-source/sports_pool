"use client";

import { TEAMS, type Game } from "@/lib/mock-data";
import { format } from "date-fns";
import { Card3D } from "./ui/3d-card";
import { cn } from "@/lib/utils";
import { GameCardProps } from "@/lib/interfaces";
import { Check, X, AlertCircle } from "lucide-react";

type TeamLike = {
  id: string;
  abbreviation: string;
  logo: string;
  primaryColor: string;
};

function getTeam(abbr: string | undefined): TeamLike | null {
  if (!abbr) return null;
  const fromTEAMS = TEAMS[abbr];
  if (fromTEAMS) return fromTEAMS;
  return { id: abbr, abbreviation: abbr, logo: "🏈", primaryColor: "#333" };
}

const TIE_PICK_VALUE = "tie";

// API-shaped games carry snake_case fields and joined team rows that the
// mock-data `Game` type does not declare.
type ApiGameFields = {
  home_team_id?: string;
  away_team_id?: string;
  home_team?: { name?: string } | null;
  away_team?: { name?: string } | null;
  home_score?: number | null;
  away_score?: number | null;
};

export function GameCard({
  game,
  onPick,
  selectedTeamId,
  selectedPrediction,
  disabled,
  gameResult,
}: GameCardProps) {
  const g = game as Game & ApiGameFields;
  const homeId = g.home_team_id ?? game.homeTeamId;
  const awayId = g.away_team_id ?? game.awayTeamId;
  const homeTeam = getTeam(homeId);
  const awayTeam = getTeam(awayId);
  const homeName = g.home_team?.name ?? homeTeam?.abbreviation ?? homeId;
  const awayName = g.away_team?.name ?? awayTeam?.abbreviation ?? awayId;

  if (!homeTeam || !awayTeam) {
    return null;
  }

  const isTieSelected = selectedPrediction === "tie";
  const hasPick = selectedTeamId || isTieSelected;
  const showResult = !!gameResult;
  const isCorrect = gameResult?.pickCorrect ?? false;
  const actualOutcome = gameResult?.actualOutcome;
  const isDisrupted = actualOutcome === "disrupted";
  const homeWon = actualOutcome === "home_win";
  const awayWon = actualOutcome === "away_win";
  const actualTie = actualOutcome === "tie";
  const homeScore = gameResult?.homeScore ?? g.home_score ?? g.homeScore;
  const awayScore = gameResult?.awayScore ?? g.away_score ?? g.awayScore;
  const hasScores = typeof homeScore === "number" && typeof awayScore === "number";

  return (
    <Card3D className="h-full min-h-[220px]" intensity={10}>
      <div
        className={cn(
          "h-full min-h-[220px] glass-panel rounded-xl p-6 flex flex-col items-center justify-between transition-all duration-300 group hover:border-primary/50",
          hasPick
            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
            : "",
        )}
      >
        <div className="w-full flex justify-between items-center gap-2 text-xs font-mono text-muted-foreground mb-4 uppercase tracking-widest min-w-0">
          <span className="truncate shrink-0">
            {format(new Date(game.date), "MMM d, h:mm a")}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {showResult && (
              <span
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                  isCorrect
                    ? "bg-green-500/20 text-green-500 border border-green-500/40"
                    : "bg-red-500/20 text-red-500 border border-red-500/40",
                )}
              >
                {isCorrect ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                {isCorrect ? "Correct" : "Wrong"}
              </span>
            )}
            <span
              className="text-primary font-bold truncate max-w-[120px]"
              title={String(game.odds ?? "")}
            >
              {showResult && hasScores
                ? `${awayScore} - ${homeScore}`
                : game.status === "scheduled"
                  ? game.odds
                  : "FINAL"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between w-full gap-2 min-w-0">
          <button
            onClick={() => !disabled && onPick?.(awayTeam.id)}
            className={cn(
              "flex-1 min-w-0 flex flex-col items-center gap-2 sm:gap-3 p-2.5 sm:p-4 rounded-lg transition-all duration-200 relative",
              selectedTeamId === awayTeam.id
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/15 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                : hasPick
                  ? "opacity-55"
                  : "opacity-80 hover:opacity-100 hover:bg-white/15 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]",
              disabled &&
                "cursor-default hover:bg-transparent hover:scale-100 hover:shadow-none",
              showResult && awayWon && "ring-2 ring-green-500/60 bg-green-500/10",
            )}
          >
            {selectedTeamId === awayTeam.id && (
              <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded bg-primary/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
                <Check className="h-2.5 w-2.5" /> Your pick
              </span>
            )}
            {showResult && awayWon && (
              <span className="absolute top-2 right-2 flex items-center gap-1 rounded bg-green-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Winner
              </span>
            )}
            <div
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-3xl sm:text-4xl shadow-lg bg-gradient-to-br from-gray-800 to-black border border-white/10 transition-transform duration-200"
              style={{
                boxShadow:
                  selectedTeamId === awayTeam.id
                    ? `0 0 20px ${awayTeam.primaryColor}60`
                    : "",
              }}
            >
              {awayTeam.logo}
            </div>
            <div className="text-center min-w-0 w-full">
              <span
                className="block font-display font-bold text-lg sm:text-xl tracking-wide truncate"
                title={awayName}
              >
                {awayTeam.abbreviation}
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                Away
              </span>
            </div>
          </button>

          <button
            onClick={() => !disabled && onPick?.(TIE_PICK_VALUE)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 px-2 sm:px-3 py-4 rounded-lg transition-all duration-200 min-w-[56px] sm:min-w-[72px] shrink-0 relative",
              isTieSelected
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/15 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                : hasPick
                  ? "opacity-55"
                  : "opacity-80 hover:opacity-100 hover:bg-white/15",
              disabled && "cursor-default hover:bg-transparent",
              showResult && actualTie && "ring-2 ring-green-500/60 bg-green-500/10",
              showResult && isDisrupted && "ring-2 ring-amber-500/60 bg-amber-500/10",
            )}
          >
            {isTieSelected && (
              <span className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded bg-primary/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground whitespace-nowrap">
                <Check className="h-2.5 w-2.5" /> Picked
              </span>
            )}
            {showResult && actualTie && (
              <span className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded bg-green-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white whitespace-nowrap">
                Winner
              </span>
            )}
            {showResult && isDisrupted && (
              <span className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white whitespace-nowrap">
                <AlertCircle className="h-2.5 w-2.5" /> Auto win
              </span>
            )}
            <span className="font-display text-lg font-black italic text-muted-foreground/50">
              VS
            </span>
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Tie
            </span>
          </button>

          <button
            onClick={() => !disabled && onPick?.(homeTeam.id)}
            className={cn(
              "flex-1 min-w-0 flex flex-col items-center gap-2 sm:gap-3 p-2.5 sm:p-4 rounded-lg transition-all duration-200 relative",
              selectedTeamId === homeTeam.id
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/15 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                : hasPick
                  ? "opacity-55"
                  : "opacity-80 hover:opacity-100 hover:bg-white/15 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]",
              disabled &&
                "cursor-default hover:bg-transparent hover:scale-100 hover:shadow-none",
              showResult && homeWon && "ring-2 ring-green-500/60 bg-green-500/10",
            )}
          >
            {selectedTeamId === homeTeam.id && (
              <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded bg-primary/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
                <Check className="h-2.5 w-2.5" /> Your pick
              </span>
            )}
            {showResult && homeWon && (
              <span className="absolute top-2 right-2 flex items-center gap-1 rounded bg-green-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Winner
              </span>
            )}
            <div
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-3xl sm:text-4xl shadow-lg bg-gradient-to-br from-gray-800 to-black border border-white/10 transition-transform duration-200"
              style={{
                boxShadow:
                  selectedTeamId === homeTeam.id
                    ? `0 0 20px ${homeTeam.primaryColor}60`
                    : "",
              }}
            >
              {homeTeam.logo}
            </div>
            <div className="text-center min-w-0 w-full">
              <span
                className="block font-display font-bold text-lg sm:text-xl tracking-wide truncate"
                title={homeName}
              >
                {homeTeam.abbreviation}
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                Home
              </span>
            </div>
          </button>
        </div>

        {hasPick && (
          <div className="mt-4 w-full text-center">
            {showResult ? (
              <div className="flex flex-col gap-1">
                {hasScores && (
                  <div className="text-sm font-mono text-muted-foreground">
                    Final: {awayName} {awayScore} – {homeName} {homeScore}
                  </div>
                )}
                {isDisrupted && (
                  <div className="text-xs font-medium text-amber-500">
                    Game canceled/postponed – your pick counts as correct
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-primary/10 border border-primary/20 text-primary py-1 px-3 rounded text-xs font-mono tracking-wider uppercase animate-in fade-in slide-in-from-bottom-2">
                Pick Confirmed
              </div>
            )}
          </div>
        )}
      </div>
    </Card3D>
  );
}
