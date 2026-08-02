"use client";

import { Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PoolTypeSelectorProps } from "@/lib/interfaces";

export function PoolTypeSelector({
  poolType,
  onTypeChange,
}: PoolTypeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div
        onClick={() => onTypeChange("public")}
        className={cn(
          "cursor-pointer p-4 rounded-xl border transition-all duration-300 flex flex-col gap-2 group",
          poolType === "public"
            ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(220,20,60,0.2)]"
            : "bg-black/20 border-white/10 hover:bg-white/10 hover:border-primary/50 hover:shadow-[0_0_20px_rgba(220,20,60,0.15)]",
        )}
      >
        <Globe
          className={cn(
            "w-6 h-6 transition-colors",
            poolType === "public"
              ? "text-primary"
              : "text-muted-foreground group-hover:text-primary",
          )}
        />
        <div>
          <div className="font-bold group-hover:text-white transition-colors">
            Public Pool
          </div>
          <div className="text-xs text-muted-foreground group-hover:text-gray-300 transition-colors">
            Open to everyone. Climb the global leaderboard.
          </div>
        </div>
      </div>

      <div
        onClick={() => onTypeChange("private")}
        className={cn(
          "cursor-pointer p-4 rounded-xl border transition-all duration-300 flex flex-col gap-2 group",
          poolType === "private"
            ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(220,20,60,0.2)]"
            : "bg-black/20 border-white/10 hover:bg-white/10 hover:border-primary/50 hover:shadow-[0_0_20px_rgba(220,20,60,0.15)]",
        )}
      >
        <Lock
          className={cn(
            "w-6 h-6 transition-colors",
            poolType === "private"
              ? "text-primary"
              : "text-muted-foreground group-hover:text-primary",
          )}
        />
        <div>
          <div className="font-bold group-hover:text-white transition-colors">
            Private Pool
          </div>
          <div className="text-xs text-muted-foreground group-hover:text-gray-300 transition-colors">
            Invite-only. Play with your friends and family.
          </div>
        </div>
      </div>
    </div>
  );
}
