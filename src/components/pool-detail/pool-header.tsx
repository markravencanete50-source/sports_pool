"use client";

import { Users, Calendar } from "lucide-react";
import { PoolHeaderProps } from "@/lib/interfaces";

export function PoolHeader({ pool }: PoolHeaderProps) {
  return (
    <div className="glass-panel p-8 rounded-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 p-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="px-2 py-0.5 bg-primary text-white text-[10px] font-bold uppercase tracking-widest rounded">
              {pool.type}
            </span>
            <span className="text-sm text-muted-foreground font-mono uppercase">
              Week {pool.week}
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black font-display italic uppercase tracking-tight mb-4">
            {pool.name}
          </h1>
          <div className="flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="text-foreground">
                {pool.participants} Players
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>Ends Sunday</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end justify-center bg-black/20 p-6 rounded-xl border border-white/5 min-w-[200px]">
          <span className="text-xs text-muted-foreground uppercase font-mono mb-1">
            Total Prize Pot
          </span>
          <span className="text-4xl font-bold text-primary font-mono">
            ${pool.prizePot.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
