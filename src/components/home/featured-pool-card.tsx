"use client";

import Link from "next/link";
import { Card3D } from "@/components/ui/3d-card";
import type { Pool } from "@/lib/types";

type FeaturedPoolCardProps = { pool?: Pool | null };

export function FeaturedPoolCard({ pool }: FeaturedPoolCardProps) {
  const prizePot = pool?.prize_pot ?? pool?.prizePot ?? 0;
  const participants = pool?.participants ?? 0;
  const hasPool = pool != null;

  return (
    <Link href={hasPool ? `/pool/${pool.id}` : "/public-pools"}>
      <Card3D intensity={15} className="w-full">
        <div className="relative overflow-hidden rounded-xl border border-primary/50 bg-gradient-to-br from-black/80 to-primary/20 backdrop-blur-xl p-6 group cursor-pointer shadow-[0_0_30px_rgba(220,20,60,0.3)] hover:shadow-[0_0_50px_rgba(220,20,60,0.5)] transition-all duration-500">
          {/* Shine Effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out z-10" />

          {/* Background Texture */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent pointer-events-none" />

          <div className="relative z-20 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center border border-primary text-3xl shadow-[0_0_15px_theme('colors.primary.DEFAULT')] animate-pulse">
                🏆
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-black font-display uppercase italic text-white group-hover:text-primary transition-colors neon-text">
                    {hasPool ? pool.name : "Main Public Pool"}
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-primary text-white text-[10px] font-bold uppercase tracking-wider animate-bounce">
                    Live
                  </span>
                </div>
                <p className="text-gray-300 text-sm max-w-md">
                  The biggest pot of the season. Compete against thousands for
                  the ultimate prize.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 min-w-[140px]">
              <div className="text-xs text-primary font-mono uppercase tracking-widest">
                Current Pot
              </div>
              <div className="text-3xl font-black text-white font-mono drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                ${prizePot.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
                {participants > 0
                  ? `${participants} player${participants === 1 ? "" : "s"} in the pool`
                  : "Be the first to join"}
              </div>
            </div>
          </div>
        </div>
      </Card3D>
    </Link>
  );
}
