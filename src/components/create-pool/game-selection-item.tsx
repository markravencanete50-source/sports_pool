"use client";

import { useState } from "react";
import { format } from "date-fns";
import { getTeamLogoUrl } from "@/lib/constants";
import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { GameSelectionItemProps } from "@/lib/interfaces";

const LogoOrPlaceholder = ({ src }: { src: string | null }) => {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  return (
    <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
      {showImg ? (
        <img
          src={src}
          alt=""
          className="w-10 h-10 object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-lg border border-white/10">
          🏈
        </div>
      )}
    </div>
  );
};

export function GameSelectionItem({
  game,
  isSelected,
  selectedTeamId,
  selectedPrediction,
  totalScorePrediction,
  onToggleSelection,
  onPickTeam,
  onPickPrediction,
  pickEnabled = true,
}: GameSelectionItemProps) {
  // Get team data from game object
  const homeTeamId = game.home_team_id || game.homeTeamId;
  const awayTeamId = game.away_team_id || game.awayTeamId;
  const homeTeam = game.home_team || { name: homeTeamId, logo: null };
  const awayTeam = game.away_team || { name: awayTeamId, logo: null };
  const gameDate = new Date(game.date);
  const odds = game.odds;

  const homeLogoUrl = homeTeam.logo || (homeTeamId ? getTeamLogoUrl(homeTeamId) : null);
  const awayLogoUrl = awayTeam.logo || (awayTeamId ? getTeamLogoUrl(awayTeamId) : null);

  return (
    <div
      className={cn(
        "bg-white/5 backdrop-blur-sm border rounded-xl p-4 transition-all duration-200 group relative overflow-hidden cursor-pointer",
        isSelected
          ? "bg-primary/10 border-primary/50 shadow-lg shadow-primary/10"
          : "border-white/10 hover:border-white/20 hover:bg-white/10",
      )}
      onClick={onToggleSelection}
    >
      <div className="relative">
        {/* Header: Time and Odds */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            {format(gameDate, "h:mm a")}
          </div>
          {odds && (
            <div className="bg-red-500/20 text-red-500 px-2 py-0.5 rounded-full text-xs font-bold border border-red-500/30">
              {odds}
            </div>
          )}
        </div>

        {/* Teams with Prediction Options */}
        <div className="space-y-3 mb-3">
          {/* Away Team - Win Option */}
          <div
            className={cn(
              "flex items-center gap-3 cursor-pointer transition-all rounded-lg p-2.5 border-2",
              pickEnabled &&
                isSelected &&
                (selectedPrediction === "away_win" ||
                  selectedTeamId === awayTeamId)
                ? "bg-primary text-white border-primary shadow-lg scale-[1.02]"
                : isSelected
                  ? "border-white/20 hover:border-white/40 hover:bg-white/10 opacity-70 hover:opacity-100"
                  : "border-transparent hover:border-white/20 hover:bg-white/5 opacity-100",
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (!isSelected) {
                onToggleSelection();
              }
              if (pickEnabled) {
                if (onPickPrediction) {
                  onPickPrediction("away_win", totalScorePrediction);
                } else {
                  onPickTeam?.(awayTeamId);
                }
              }
            }}
          >
            <LogoOrPlaceholder src={awayLogoUrl} />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base leading-none">
                {awayTeam.name || awayTeamId} WINS
              </div>
            </div>
            {pickEnabled &&
              isSelected &&
              (selectedPrediction === "away_win" ||
                selectedTeamId === awayTeamId) && (
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white"></div>
                </div>
              )}
          </div>

          {/* VS (or Tie) Option */}
          <div
            className={cn(
              "flex items-center justify-center gap-2 cursor-pointer transition-all rounded-lg p-2.5 border-2",
              pickEnabled && isSelected && selectedPrediction === "tie"
                ? "bg-yellow-500/20 text-yellow-500 border-yellow-500 shadow-lg scale-[1.02]"
                : isSelected
                  ? "border-white/20 hover:border-white/40 hover:bg-white/10 opacity-70 hover:opacity-100"
                  : "border-transparent hover:border-white/20 hover:bg-white/5 opacity-100",
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (!isSelected) {
                onToggleSelection();
              }
              if (pickEnabled && onPickPrediction) {
                onPickPrediction("tie", totalScorePrediction);
              }
            }}
          >
            <span className="text-sm font-bold">
              {pickEnabled ? "TIE" : "VS"}
            </span>
            {pickEnabled && isSelected && selectedPrediction === "tie" && (
              <div className="w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
              </div>
            )}
          </div>

          {/* Home Team - Win Option */}
          <div
            className={cn(
              "flex items-center gap-3 cursor-pointer transition-all rounded-lg p-2.5 border-2",
              pickEnabled &&
                isSelected &&
                (selectedPrediction === "home_win" ||
                  selectedTeamId === homeTeamId)
                ? "bg-primary text-white border-primary shadow-lg scale-[1.02]"
                : isSelected
                  ? "border-white/20 hover:border-white/40 hover:bg-white/10 opacity-70 hover:opacity-100"
                  : "border-transparent hover:border-white/20 hover:bg-white/5 opacity-100",
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (!isSelected) {
                onToggleSelection();
              }
              if (pickEnabled) {
                if (onPickPrediction) {
                  onPickPrediction("home_win", totalScorePrediction);
                } else {
                  onPickTeam?.(homeTeamId);
                }
              }
            }}
          >
            <LogoOrPlaceholder src={homeLogoUrl} />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base leading-none">
                {homeTeam.name || homeTeamId} WINS
              </div>
            </div>
            {pickEnabled &&
              isSelected &&
              (selectedPrediction === "home_win" ||
                selectedTeamId === homeTeamId) && (
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white"></div>
                </div>
              )}
          </div>
        </div>

        {/* Total Score Prediction (Optional Tie-Breaker) - only when picking */}
        {pickEnabled && isSelected && (
          <div className="mb-3 pt-3 border-t border-white/10">
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Total Score Prediction{" "}
              <span className="text-muted-foreground/60">
                (Optional - Tie Breaker)
              </span>
            </label>
            <input
              type="number"
              min="0"
              max="200"
              placeholder="e.g. 45"
              value={totalScorePrediction || ""}
              onChange={(e) => {
                e.stopPropagation();
                const value = e.target.value
                  ? parseInt(e.target.value)
                  : undefined;
                if (onPickPrediction && selectedPrediction) {
                  onPickPrediction(selectedPrediction, value);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}

        {/* Footer: Selection checkbox */}
        <div className="flex items-center justify-between pt-3 border-t border-white/10">
          <div className="text-xs text-muted-foreground">
            {format(gameDate, "EEE, MMM d")}
          </div>
          <div
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all cursor-pointer",
              isSelected
                ? "bg-primary border-primary text-white shadow-lg shadow-primary/50"
                : "border-white/30 text-transparent hover:border-white/50 hover:bg-white/10",
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelection();
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Check className="w-3.5 h-3.5" />
          </div>
        </div>

        {pickEnabled && isSelected && !selectedTeamId && (
          <div className="mt-2 text-[10px] text-center text-primary/80 font-medium">
            Click a team to pick winner (optional)
          </div>
        )}
      </div>
    </div>
  );
}
