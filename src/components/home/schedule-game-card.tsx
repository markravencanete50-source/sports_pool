"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Card3D } from "@/components/ui/3d-card";
import { getTeamLogoUrl } from "@/lib/constants";
import { Clock, Trophy } from "lucide-react";
import { ScheduleGameCardProps } from "@/lib/interfaces";

const LogoOrPlaceholder = ({ src }: { src: string | null }) => {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  return (
    <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
      {showImg ? (
        <img
          src={src}
          alt=""
          className="w-12 h-12 object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-2xl border border-white/10">
          🏈
        </div>
      )}
    </div>
  );
};

export function ScheduleGameCard({ game }: ScheduleGameCardProps) {
  const homeTeamId = game.home_team_id || game.homeTeamId;
  const awayTeamId = game.away_team_id || game.awayTeamId;
  const homeTeam = game.home_team || {
    name: homeTeamId,
    logo: null,
  };
  const awayTeam = game.away_team || {
    name: awayTeamId,
    logo: null,
  };
  const gameDate = new Date(game.date);
  const status = game.status || "scheduled";
  const odds = game.odds;
  const homeScore = game.home_score || game.homeScore;
  const awayScore = game.away_score || game.awayScore;

  const homeLogoUrl =
    homeTeam.logo || (homeTeamId ? getTeamLogoUrl(homeTeamId) : null);
  const awayLogoUrl =
    awayTeam.logo || (awayTeamId ? getTeamLogoUrl(awayTeamId) : null);

  const getStatusBadge = () => {
    if (status === "live") {
      return (
        <div className="flex items-center gap-1.5 text-xs font-bold text-red-500 animate-pulse">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          LIVE
        </div>
      );
    }
    if (status === "finished") {
      return (
        <div className="flex items-center gap-1.5 text-xs font-bold text-green-500">
          <Trophy className="w-3 h-3" />
          FINAL
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        {format(gameDate, "h:mm a")}
      </div>
    );
  };

  return (
    <Card3D intensity={3} className="h-full">
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-5 rounded-xl group hover:bg-white/10 hover:border-white/20 transition-all duration-300 h-full flex flex-col shadow-lg">
        {/* Header: Time and Odds */}
        <div className="flex items-center justify-between mb-4">
          {getStatusBadge()}
          {odds && (
            <div className="bg-red-500/20 text-red-500 px-2.5 py-1 rounded-full text-xs font-bold border border-red-500/30">
              {odds}
            </div>
          )}
        </div>

        {/* Teams Section */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Away Team */}
          <div className="flex items-center gap-4">
            <LogoOrPlaceholder src={awayLogoUrl} />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-xl leading-none truncate">
                {awayTeam.name || awayTeamId}
              </div>
            </div>
            {status === "finished" && awayScore !== null && (
              <div className="text-3xl font-bold">{awayScore}</div>
            )}
          </div>

          {/* VS Separator */}
          <div className="flex items-center justify-center py-2">
            <span className="text-lg font-black text-muted-foreground/40 font-display italic">
              VS
            </span>
          </div>

          {/* Home Team */}
          <div className="flex items-center gap-4">
            <LogoOrPlaceholder src={homeLogoUrl} />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-xl leading-none truncate">
                {homeTeam.name || homeTeamId}
              </div>
            </div>
            {status === "finished" && homeScore !== null && (
              <div className="text-3xl font-bold">{homeScore}</div>
            )}
          </div>
        </div>

        {/* Date Footer */}
        <div className="mt-5 pt-4 border-t border-white/10">
          <div className="text-xs text-muted-foreground text-center font-medium">
            {format(gameDate, "EEE, MMM d, yyyy")}
          </div>
        </div>
      </div>
    </Card3D>
  );
}
