"use client";

import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { FriendInviteCardProps } from "@/lib/interfaces";

export function FriendInviteCard({
  friend,
  isInvited,
  onToggle,
}: FriendInviteCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isInvited}
      className={cn(
        "w-full text-left flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200",
        isInvited
          ? "bg-primary/10 border-primary"
          : "bg-black/20 border-white/5 hover:bg-white/15 hover:border-white/30 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]",
      )}
    >
      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm border border-white/10">
        {friend.avatar}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate">{friend.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {friend.email}
        </div>
      </div>
      {isInvited ? (
        <Check className="w-4 h-4 text-primary" />
      ) : (
        <Plus className="w-4 h-4 text-muted-foreground" />
      )}
    </button>
  );
}
