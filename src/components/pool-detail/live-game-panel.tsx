"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Live field panel — the "something to watch" the brief asked for.
 *
 * Renders from the live-state columns on games (period, display_clock,
 * possession, down_distance, yard_line, is_red_zone), which the scheduled
 * sync fills from ESPN's situation block. ESPN's yardLine is the absolute
 * line from 0 (the away end zone) to 100 (the home end zone); the ball marker
 * is placed on that scale and the possession side is highlighted, so the
 * picture reads the same way a broadcast graphic does without pretending to
 * know the direction of play.
 */
export interface LiveGamePanelProps {
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number | null | undefined;
  awayScore: number | null | undefined;
  period?: number | null;
  displayClock?: string | null;
  possession?: string | null;
  downDistance?: string | null;
  yardLine?: number | null;
  isRedZone?: boolean | null;
  lastSyncedAt?: string | null;
  className?: string;
}

function periodLabel(period: number | null | undefined): string {
  if (!period) return "LIVE";
  if (period <= 4) return `Q${period}`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}

export function LiveGamePanel({
  homeAbbr,
  awayAbbr,
  homeScore,
  awayScore,
  period,
  displayClock,
  possession,
  downDistance,
  yardLine,
  isRedZone,
  lastSyncedAt,
  className,
}: LiveGamePanelProps) {
  const hasBall = typeof yardLine === "number" && yardLine >= 0 && yardLine <= 100;
  const ballPct = hasBall ? yardLine : null;
  const awayHasBall = possession != null && possession === awayAbbr;
  const homeHasBall = possession != null && possession === homeAbbr;
  // Wall-clock reads are impure during render; sample it after mount and tick.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clock seeded after mount; Date.now() must not run during render
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const synced = lastSyncedAt ? new Date(lastSyncedAt) : null;
  const staleMinutes = synced && now != null ? Math.round((now - synced.getTime()) / 60_000) : null;

  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-black/30 p-3 sm:p-4 space-y-3",
        isRedZone && "border-red-500/50 shadow-[0_0_24px_rgba(215,38,61,0.25)]",
        className
      )}
      aria-label="Live game state"
    >
      <div className="flex items-center justify-between gap-3 text-xs font-mono uppercase tracking-widest">
        <span className="flex items-center gap-2 text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {periodLabel(period)}
          {displayClock && <span className="text-foreground tabular-nums">{displayClock}</span>}
        </span>
        <span className="text-muted-foreground truncate">
          {downDistance ?? (isRedZone ? "Red zone" : "In progress")}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className={cn("flex items-center gap-2", awayHasBall && "text-primary")}>
          <span className="font-display font-black text-xl">{awayAbbr}</span>
          {awayHasBall && <span aria-label="has possession">🏈</span>}
        </div>
        <div className="font-mono text-2xl font-bold tabular-nums">
          {awayScore ?? 0} <span className="text-muted-foreground/60">–</span> {homeScore ?? 0}
        </div>
        <div className={cn("flex items-center gap-2", homeHasBall && "text-primary")}>
          {homeHasBall && <span aria-label="has possession">🏈</span>}
          <span className="font-display font-black text-xl">{homeAbbr}</span>
        </div>
      </div>

      {/* Field graphic: 10 zones + end zones, ball marker on the absolute yard line. */}
      <div className="relative">
        <div className="relative h-12 w-full overflow-hidden rounded-md border border-white/10 bg-gradient-to-b from-emerald-800/70 to-emerald-900/70">
          <div className="absolute inset-y-0 left-0 w-[8%] bg-primary/40 flex items-center justify-center text-[9px] font-mono text-white/80 rotate-180 [writing-mode:vertical-rl]">
            {awayAbbr}
          </div>
          <div className="absolute inset-y-0 right-0 w-[8%] bg-accent/40 flex items-center justify-center text-[9px] font-mono text-white/80 [writing-mode:vertical-rl]">
            {homeAbbr}
          </div>
          <div className="absolute inset-y-0 left-[8%] right-[8%]">
            {Array.from({ length: 11 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "absolute inset-y-0 border-l border-white/25",
                  i === 5 && "border-white/60"
                )}
                style={{ left: `${i * 10}%` }}
              />
            ))}
            {isRedZone && (
              <div
                className="absolute inset-y-0 bg-red-500/25"
                style={awayHasBall ? { right: 0, width: "20%" } : { left: 0, width: "20%" }}
              />
            )}
            {ballPct != null && (
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-base drop-shadow"
                style={{ left: `${ballPct}%` }}
                aria-label={`Ball on the ${ballPct} yard line`}
                title={`Ball at yard line ${ballPct}`}
              >
                🏈
              </div>
            )}
          </div>
        </div>
        {!hasBall && (
          <p className="mt-1 text-[10px] text-muted-foreground text-center">
            Ball position updates with the next sync
          </p>
        )}
      </div>

      {staleMinutes != null && (
        <p className="text-[10px] text-muted-foreground text-right">
          Updated {staleMinutes <= 1 ? "just now" : `${staleMinutes} min ago`}
        </p>
      )}
    </div>
  );
}
