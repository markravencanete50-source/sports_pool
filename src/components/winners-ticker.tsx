"use client";

import { useWinners } from "@/lib/hooks/use-winners";

export function WinnersTicker() {
  const { data: winners = [], isLoading } = useWinners(50);

  // Duplicate winners for seamless scroll
  const displayWinners = winners.length > 0 ? [...winners, ...winners] : [];

  if (isLoading) {
    return (
      <div className="w-full overflow-hidden bg-black/40 border-y border-white/5 backdrop-blur-sm py-3 mb-8 select-none relative">
        <div className="flex animate-pulse whitespace-nowrap">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="inline-flex items-center gap-2 mx-8">
              <div className="w-8 h-8 rounded-full bg-white/10"></div>
              <div className="h-4 w-20 bg-white/10 rounded"></div>
              <div className="h-4 w-16 bg-white/10 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (winners.length === 0) {
    return null;
  }

  return (
    <div className="w-full overflow-hidden bg-black/40 border-y border-white/5 backdrop-blur-sm py-3 mb-8 select-none relative group">
      <div className="absolute left-0 top-0 bottom-0 w-10 sm:w-24 lg:w-32 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-10 sm:w-24 lg:w-32 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

      <div className="flex animate-marquee whitespace-nowrap group-hover:[animation-play-state:paused]">
        {displayWinners.map((winner, idx) => (
          <div key={`${winner.id}-${idx}`} className="inline-flex items-center gap-2 mx-8 text-sm font-mono">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 shadow-[0_0_10px_rgba(0,0,0,0.5)] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              {winner.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote host not allow-listed for the image optimizer; small asset
                <img
                  src={winner.avatar}
                  alt={winner.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="text-primary text-xs font-bold">{winner.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <span className="text-muted-foreground font-medium">{winner.name}</span>
            <span className="text-primary font-bold flex items-center gap-1">
              <span className="text-xs text-muted-foreground/50">$</span>
              {typeof winner.amount === 'number' ? winner.amount.toLocaleString() : winner.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
