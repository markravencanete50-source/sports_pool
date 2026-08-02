"use client";

import { Trophy } from "lucide-react";
import { Card3D } from "@/components/ui/3d-card";
import { PoolSummaryCardProps } from "@/lib/interfaces";

export function PoolSummaryCard({
  poolName,
  poolType,
  entryFee,
  maxParticipants,
  selectedGamesCount,
  invitedFriendsCount,
  grossPot,
  platformFee,
  netPot,
  isSubmitting,
  canSubmit,
  formatCurrency,
}: PoolSummaryCardProps) {
  return (
    <div className="sticky top-24">
      <Card3D intensity={5}>
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 space-y-6">
          <h3 className="text-xl font-bold font-display uppercase border-b border-white/10 pb-4">
            Pool Summary
          </h3>

          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pool Name</span>
              <span className="font-bold text-right truncate max-w-[150px]">
                {poolName || "Untitled Pool"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Type</span>
              <span className="font-bold capitalize">{poolType}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Entry Fee</span>
              <span className="font-bold">${entryFee}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Max Players</span>
              <span className="font-bold capitalize">{maxParticipants}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Games Selected</span>
              <span className="font-bold">{selectedGamesCount}</span>
            </div>
            {poolType === "private" && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Invited (by email)</span>
                <span className="font-bold">{invitedFriendsCount}</span>
              </div>
            )}
          </div>

          <div className="h-px bg-white/10" />

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Gross Pot (Est.)</span>
              <span className="font-mono">${formatCurrency(grossPot)}</span>
            </div>

            <div className="flex items-center justify-between text-sm text-red-400">
              <span className="text-muted-foreground">Platform Fee (Est.)</span>
              <span className="font-mono">-${formatCurrency(platformFee)}</span>
            </div>

            <div className="h-px bg-white/10 my-2 border-dashed" />

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-bold">
                Net Prize Pot
              </span>
              <span className="font-bold text-primary flex items-center gap-1 text-lg">
                <Trophy className="w-5 h-5" />${formatCurrency(netPot)}
              </span>
            </div>
          </div>

          <button
            type="submit"
            form="create-pool-form"
            disabled={!canSubmit || isSubmitting}
            className="w-full btn-3d-primary py-4 text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {isSubmitting ? <>Creating Pool...</> : <>Create Pool</>}
          </button>
          {!canSubmit && (
            <p className="text-xs text-center text-muted-foreground">
              Select at least 1 game to create pool
            </p>
          )}
        </div>
      </Card3D>
    </div>
  );
}
