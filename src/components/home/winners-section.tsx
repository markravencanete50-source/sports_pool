"use client";

import { WinnersTicker } from "@/components/winners-ticker";

export function WinnersSection() {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2 px-2">
        <div className="w-3 h-3 rounded-full bg-green-500 animate-flash-green" />
        <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Recent Winners
        </span>
      </div>
      <WinnersTicker />
    </section>
  );
}
