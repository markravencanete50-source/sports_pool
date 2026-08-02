"use client";

import { Users } from "lucide-react";
import { User } from "@/lib/mock-data";
import { FriendInviteCard } from "./friend-invite-card";
import { FriendInvitationSectionProps } from "@/lib/interfaces";

export function FriendInvitationSection({
  friends,
  invitedFriends,
  onToggleFriend,
}: FriendInvitationSectionProps) {
  return (
    <div className="space-y-4 pt-4 border-t border-white/10 animate-in fade-in slide-in-from-top-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold font-display flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> Invite Friends
        </h3>
        <span className="text-xs text-muted-foreground">
          {invitedFriends.length} friends invited
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {friends.map((friend) => (
          <FriendInviteCard
            key={friend.id}
            friend={friend}
            isInvited={invitedFriends.includes(friend.id)}
            onToggle={() => onToggleFriend(friend.id)}
          />
        ))}
      </div>
    </div>
  );
}
