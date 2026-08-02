"use client";

import { DollarSign, Users } from "lucide-react";
import { PoolSettingsFormProps } from "@/lib/interfaces";

export function PoolSettingsForm({
  entryFee,
  maxParticipants,
  onEntryFeeChange,
  onMaxParticipantsChange,
}: PoolSettingsFormProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-2">
        <label className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-2">
          <DollarSign className="w-3 h-3" /> Entry Fee ($)
        </label>
        <input
          type="number"
          min="0"
          value={entryFee}
          onChange={(e) => onEntryFeeChange(e.target.value)}
          className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-primary transition-all"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-2">
          <Users className="w-3 h-3" /> Max Participants
        </label>
        <select
          value={maxParticipants}
          onChange={(e) => onMaxParticipantsChange(e.target.value)}
          className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-primary transition-all appearance-none"
        >
          <option value="unlimited">Unlimited</option>
          <option value="10">10 Players</option>
          <option value="20">20 Players</option>
          <option value="50">50 Players</option>
          <option value="100">100 Players</option>
        </select>
      </div>
    </div>
  );
}
