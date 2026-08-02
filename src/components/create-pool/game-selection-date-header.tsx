"use client";

import { format } from "date-fns";
import { GameSelectionDateHeaderProps } from "@/lib/interfaces";

export function GameSelectionDateHeader({ date, gameCount }: GameSelectionDateHeaderProps) {
  const dateFormatted = format(date, "EEEE, MMM d").toUpperCase();
  
  return (
    <div className="relative">
      <div className="bg-gradient-to-b from-gray-900/90 to-gray-800/90 border border-white/10 rounded-lg px-4 py-3 shadow-lg flex items-center justify-between">
        {/* Red accent bar */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-lg"></div>
        
        {/* Date text */}
        <div className="flex items-center gap-3 pl-3">
          <span className="text-white font-bold text-sm tracking-wider font-display italic">
            {dateFormatted}
          </span>
        </div>

        {/* Progress indicator */}
        {gameCount !== undefined && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 bg-gray-700 rounded-full overflow-hidden flex">
              <div 
                className="bg-primary h-full transition-all"
                style={{ width: `${Math.min((gameCount / 10) * 100, 100)}%` }}
              />
              <div className="bg-gray-600 h-full flex-1" />
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {gameCount}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
