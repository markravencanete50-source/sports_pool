"use client";

import { ProgressCardProps } from "@/lib/interfaces";

export function ProgressCard({ picksMade, totalGames }: ProgressCardProps) {
  const percentage = totalGames > 0 ? (picksMade / totalGames) * 100 : 0;

  return (
    <div className="glass-panel p-6 rounded-xl">
      <h3 className="text-lg font-bold font-display uppercase mb-4 border-b border-white/10 pb-2">
        My Progress
      </h3>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Picks Made</span>
          <span className="font-mono font-bold">
            {picksMade} / {totalGames}
          </span>
        </div>
        <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
          <div
            className="bg-primary h-full transition-all duration-500 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
