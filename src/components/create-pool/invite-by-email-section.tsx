"use client";

import { useState } from "react";
import { Mail, X } from "lucide-react";

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

export interface InviteByEmailSectionProps {
  emails: string[];
  onAddEmail: (email: string) => void;
  onRemoveEmail: (email: string) => void;
}

export function InviteByEmailSection({
  emails,
  onAddEmail,
  onRemoveEmail,
}: InviteByEmailSectionProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    setError(null);
    const parsed = parseEmails(inputValue);
    if (parsed.length === 0) return;
    const invalid: string[] = [];
    const toAdd: string[] = [];
    const alreadyInList: string[] = [];
    const seen = new Set<string>();
    for (const email of parsed) {
      if (!validateEmail(email)) {
        invalid.push(email);
        continue;
      }
      if (emails.includes(email)) {
        alreadyInList.push(email);
        continue;
      }
      if (seen.has(email)) continue;
      seen.add(email);
      toAdd.push(email);
    }
    if (invalid.length > 0) {
      setError(
        invalid.length === 1
          ? "Enter a valid email address."
          : `Invalid: ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}`,
      );
      return;
    }
    toAdd.forEach((e) => onAddEmail(e));
    setInputValue("");
    if (alreadyInList.length > 0 && toAdd.length === 0) {
      setError("Those emails are already in the list.");
    }
  };

  return (
    <div className="space-y-4 pt-4 border-t border-white/10 animate-in fade-in slide-in-from-top-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold font-display flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" /> Invite user
        </h3>
        <span className="text-xs text-muted-foreground">
          {emails.length} {emails.length === 1 ? "email" : "emails"} added
        </span>
      </div>

      <div className="flex gap-2">
        <input
          type="email"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && (e.preventDefault(), handleAdd())
          }
          placeholder="friend@example.com, other@example.com"
          className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 shrink-0"
        >
          Add
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {emails.length > 0 && (
        <ul className="space-y-2">
          {emails.map((email) => (
            <li
              key={email}
              className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-white/5 border border-white/10"
            >
              <span className="text-sm truncate">{email}</span>
              <button
                type="button"
                onClick={() => onRemoveEmail(email)}
                className="shrink-0 p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${email}`}
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Only users who have an account with that email can be invited.
      </p>
    </div>
  );
}
