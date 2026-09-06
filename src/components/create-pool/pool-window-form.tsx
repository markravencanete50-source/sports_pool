"use client";

import { CalendarClock, Lock } from "lucide-react";
import { POOL_WINDOW_MAX_DAYS } from "@/lib/validations";

/**
 * Optional entry window (≤ 7 days) and, for private pools, an optional
 * password. Both are validated again server-side; this only keeps the form
 * honest before the request leaves.
 */
export function PoolWindowForm({
  startsAt,
  endsAt,
  password,
  isPrivate,
  onStartsAtChange,
  onEndsAtChange,
  onPasswordChange,
}: {
  startsAt: string;
  endsAt: string;
  password: string;
  isPrivate: boolean;
  onStartsAtChange: (value: string) => void;
  onEndsAtChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}) {
  const spanDays =
    startsAt && endsAt ? (Date.parse(endsAt) - Date.parse(startsAt)) / (24 * 3600_000) : null;
  const spanProblem =
    spanDays != null && (spanDays <= 0 || spanDays > POOL_WINDOW_MAX_DAYS)
      ? spanDays <= 0
        ? "The window must end after it starts"
        : `A pool can run for at most ${POOL_WINDOW_MAX_DAYS} days`
      : null;

  const inputClass =
    "w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-primary transition-all";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-2">
          <CalendarClock className="w-3 h-3" /> Entry window <span className="text-muted-foreground/60">(optional)</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Choose when players can buy in — a weekend, a few days, or the full week. Leave blank to stay open until the games start.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="pool-starts-at" className="text-xs font-mono uppercase text-muted-foreground">
            Opens
          </label>
          <input
            id="pool-starts-at"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => onStartsAtChange(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="pool-ends-at" className="text-xs font-mono uppercase text-muted-foreground">
            Closes
          </label>
          <input
            id="pool-ends-at"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => onEndsAtChange(e.target.value)}
            className={inputClass}
            aria-invalid={!!spanProblem}
          />
        </div>
      </div>
      {spanProblem ? (
        <p className="text-xs text-red-400">{spanProblem}</p>
      ) : spanDays != null ? (
        <p className="text-xs text-muted-foreground">
          Window length: {spanDays.toFixed(spanDays % 1 === 0 ? 0 : 1)} day{spanDays === 1 ? "" : "s"}
        </p>
      ) : null}

      {isPrivate && (
        <div className="space-y-2 pt-2">
          <label htmlFor="pool-password" className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-2">
            <Lock className="w-3 h-3" /> Pool password <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <input
            id="pool-password"
            type="text"
            autoComplete="off"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            minLength={4}
            maxLength={64}
            placeholder="Anyone with the link and this password can join"
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">
            4–64 characters. Share it with the link or QR code; you can change it later from the pool page.
          </p>
        </div>
      )}
    </div>
  );
}
