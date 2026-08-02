"use client";

import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

function validateEmail(email: string): boolean {
  return emailRegex.test(email);
}

export interface PoolInviteByEmailProps {
  poolId: string;
  onSuccess?: () => void;
}

export function PoolInviteByEmail({
  poolId,
  onSuccess,
}: PoolInviteByEmailProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInvite = async () => {
    setError(null);
    const parsed = parseEmails(inputValue);
    if (parsed.length === 0) {
      setError("Enter one or more email addresses, separated by commas.");
      return;
    }
    const invalid = parsed.filter((e) => !validateEmail(e));
    if (invalid.length > 0) {
      setError(
        `Invalid: ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/pools/${poolId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emails: parsed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to send invites");
        return;
      }
      setInputValue("");
      onSuccess?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="glass-panel p-4 rounded-xl space-y-4">
      <h3 className="text-sm font-bold font-display uppercase flex items-center gap-2">
        <Mail className="w-4 h-4 text-primary" /> Invite user
      </h3>
      <p className="text-xs text-muted-foreground">
        Add one or more emails separated by commas.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && (e.preventDefault(), handleInvite())
          }
          placeholder="friend@example.com, other@example.com"
          className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          disabled={isSubmitting}
        />
        <button
          type="button"
          onClick={handleInvite}
          disabled={isSubmitting}
          className="px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 shrink-0 text-sm"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Invite"
          )}
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
