"use client";

import { format } from "date-fns";
import { GameDateHeaderProps } from "@/lib/interfaces";

export function GameDateHeader({ date }: GameDateHeaderProps) {
  return (
    <div className="relative flex items-center gap-4">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="px-4 py-1 rounded-full border border-primary/30 bg-primary/10 backdrop-blur-sm shadow-[0_0_15px_hsl(var(--primary)/0.25)]">
        <h3 className="text-sm font-bold font-display text-primary uppercase tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-flash" />
          {format(date, "EEEE, MMMM do")}
        </h3>
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </div>
  );
}
