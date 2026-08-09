"use client";

import { Card3D } from "./ui/3d-card";
import Link from "next/link";
import { Users, Trophy, ArrowRight } from "lucide-react";
import { Pool } from "@/lib/types";

export function PoolCard({ pool }: { pool: Pool }) {
  const entryFee = pool.entryFee ?? pool.entry_fee ?? 0;
  const prizePot = pool.prizePot ?? pool.prize_pot ?? 0;

  return (
    <Link href={`/pool/${pool.id}`}>
      <div className="cursor-pointer h-full">
        <Card3D className="h-full" intensity={5}>
          <div className="h-full glass-panel p-6 rounded-xl flex flex-col gap-4 hover:border-primary hover:shadow-[0_0_25px_hsl(var(--primary)/0.2)] hover:bg-white/5 transition-all duration-300 group relative overflow-hidden">

            {/* Decorative background glow */}
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-500" />

            <div className="flex justify-between items-start gap-3 z-10">
              <div className="min-w-0">
                <span className="inline-block px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  {pool.type} Pool
                </span>
                <h3 className="text-xl font-bold truncate">{pool.name}</h3>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="text-xs text-muted-foreground uppercase font-mono">Entry</span>
                <span className="text-lg font-bold text-primary">${entryFee}</span>
              </div>
            </div>

            <div className="flex-1 flex items-center gap-6 py-4 border-y border-white/5 my-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Players</p>
                  <p className="font-mono font-bold">{pool.participants}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Prize Pot</p>
                  <p className="font-mono font-bold text-yellow-500">${prizePot.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center z-10">
              <span className="text-xs font-mono text-muted-foreground">Week {pool.week} • {pool.status.toUpperCase()}</span>
              <span className="flex items-center gap-1 text-sm font-bold text-primary group-hover:translate-x-1 transition-transform">
                JOIN NOW <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </div>
        </Card3D>
      </div>
    </Link>
  );
}
