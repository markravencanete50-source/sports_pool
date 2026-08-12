"use client";

import { useEffect, useState } from "react";
import Layout from "@/components/layout";
import { toast } from "sonner";

/*
 * Responsible-gambling controls.
 *
 * The interface is deliberately blunt about consequences before an action, not
 * after it. Self-exclusion in particular is irreversible by design, so the
 * confirmation says so in plain words and requires the period to be chosen
 * explicitly — a control someone reaches for in a bad moment should not be
 * easy to trigger by accident, and should not pretend it can be undone.
 *
 * Nothing here is the enforcement. The server RPCs are: limits and exclusions
 * are applied by SECURITY DEFINER functions that derive identity from the
 * session, and every paid action re-checks them. This screen only collects
 * intent.
 */

interface Settings {
  deposit_limit_daily: number | null;
  deposit_limit_weekly: number | null;
  deposit_limit_monthly: number | null;
  pending_limit_daily: number | null;
  pending_limit_weekly: number | null;
  pending_limit_monthly: number | null;
  pending_limits_effective_at: string | null;
  self_excluded_until: string | null;
  cooling_off_until: string | null;
  kyc_status: string;
}

const EXCLUSION_PERIODS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 182, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 1825, label: "5 years" },
];

export default function ResponsibleGamingPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [daily, setDaily] = useState("");
  const [weekly, setWeekly] = useState("");
  const [monthly, setMonthly] = useState("");
  const [exclusionDays, setExclusionDays] = useState<number>(30);
  const [confirmingExclusion, setConfirmingExclusion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/responsible-gaming");
        if (!res.ok) throw new Error("Could not load your settings");
        const json = await res.json();
        if (cancelled) return;
        const s = json.settings as Settings | null;
        setSettings(s);
        setDaily(s?.deposit_limit_daily != null ? String(s.deposit_limit_daily) : "");
        setWeekly(s?.deposit_limit_weekly != null ? String(s.deposit_limit_weekly) : "");
        setMonthly(s?.deposit_limit_monthly != null ? String(s.deposit_limit_monthly) : "");
      } catch {
        if (!cancelled) toast.error("Could not load your settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const excludedUntil = settings?.self_excluded_until
    ? new Date(settings.self_excluded_until)
    : null;
  const isExcluded = excludedUntil !== null && excludedUntil > new Date();

  const saveLimits = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/me/responsible-gaming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_limits",
          limits: {
            daily: daily === "" ? null : Number(daily),
            weekly: weekly === "" ? null : Number(weekly),
            monthly: monthly === "" ? null : Number(monthly),
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not update your limits");
      toast.success(json.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your limits");
    } finally {
      setSaving(false);
    }
  };

  const applyExclusion = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/me/responsible-gaming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "self_exclude",
          exclusion: { days: exclusionDays, confirm: true },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not apply self-exclusion");
      toast.success(json.message);
      setSettings((prev) => (prev ? { ...prev, self_excluded_until: json.until } : prev));
      setConfirmingExclusion(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply self-exclusion");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Responsible gaming</h1>
          <p className="text-muted-foreground">
            Set your own limits, or take a break. These controls are enforced on
            our side, not just in this browser.
          </p>
        </header>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <>
            {isExcluded && (
              <section
                role="alert"
                className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 space-y-2"
              >
                <h2 className="font-bold">Your account is self-excluded</h2>
                <p className="text-sm">
                  You cannot enter paid contests until{" "}
                  <strong>{excludedUntil!.toISOString().slice(0, 10)}</strong>. This
                  cannot be lifted early, by you or by support.
                </p>
                <p className="text-sm text-muted-foreground">
                  If you need help with gambling, the National Council on Problem
                  Gambling helpline is available 24/7 in the US on{" "}
                  <strong>1-800-522-4700</strong>.
                </p>
              </section>
            )}

            <section className="glass-panel rounded-xl p-6 space-y-5">
              <div className="space-y-1">
                <h2 className="text-xl font-bold">Spending limits</h2>
                <p className="text-sm text-muted-foreground">
                  The most you can spend on entries in a rolling period. Leave a
                  field empty for no limit. Lowering a limit applies immediately;
                  raising one takes effect after 24 hours.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { id: "limit-daily", label: "Daily ($)", value: daily, set: setDaily },
                  { id: "limit-weekly", label: "Weekly ($)", value: weekly, set: setWeekly },
                  { id: "limit-monthly", label: "Monthly ($)", value: monthly, set: setMonthly },
                ].map((f) => (
                  <div key={f.id} className="space-y-2">
                    <label
                      htmlFor={f.id}
                      className="text-xs font-mono uppercase text-muted-foreground"
                    >
                      {f.label}
                    </label>
                    <input
                      id={f.id}
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      value={f.value}
                      onChange={(e) => f.set(e.target.value)}
                      placeholder="No limit"
                      className="w-full rounded-lg border border-white/10 bg-black/20 px-4 py-3 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                ))}
              </div>

              {settings?.pending_limits_effective_at && (
                <p className="text-sm text-amber-400">
                  A limit increase is scheduled and takes effect on{" "}
                  {new Date(settings.pending_limits_effective_at).toLocaleString()}.
                </p>
              )}

              <button
                type="button"
                onClick={saveLimits}
                disabled={saving}
                className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save limits"}
              </button>
            </section>

            <section className="glass-panel rounded-xl p-6 space-y-5">
              <div className="space-y-1">
                <h2 className="text-xl font-bold">Take a break</h2>
                <p className="text-sm text-muted-foreground">
                  Self-exclusion blocks you from entering any paid contest for the
                  period you choose. It cannot be shortened or cancelled once set —
                  not by you, and not by our support team. Your balance remains
                  yours and can still be withdrawn.
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="exclusion-period"
                  className="text-xs font-mono uppercase text-muted-foreground"
                >
                  Period
                </label>
                <select
                  id="exclusion-period"
                  value={exclusionDays}
                  onChange={(e) => setExclusionDays(Number(e.target.value))}
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-4 py-3 focus:outline-none focus:ring-1 focus:ring-primary sm:max-w-xs"
                >
                  {EXCLUSION_PERIODS.map((p) => (
                    <option key={p.days} value={p.days}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {confirmingExclusion ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 space-y-3">
                  <p className="text-sm font-semibold">
                    This is permanent for the period you chose. Continue?
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={applyExclusion}
                      disabled={saving}
                      className="rounded-lg bg-destructive px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {saving ? "Applying…" : "Yes, exclude me"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingExclusion(false)}
                      className="rounded-lg border border-white/15 px-5 py-2.5 text-sm font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingExclusion(true)}
                  disabled={isExcluded}
                  className="rounded-lg border border-destructive/50 px-5 py-3 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  {isExcluded ? "Already self-excluded" : "Self-exclude"}
                </button>
              )}
            </section>

            <section className="glass-panel rounded-xl p-6 space-y-4">
              <div className="space-y-1">
                <h2 className="text-xl font-bold">Your data</h2>
                <p className="text-sm text-muted-foreground">
                  Download everything we hold about you, or close your account.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href="/api/me/data-export"
                  className="rounded-lg border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5"
                >
                  Download my data
                </a>
                <a
                  href="/account/security"
                  className="rounded-lg border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5"
                >
                  Two-factor authentication
                </a>
                <a
                  href="/account/close"
                  className="rounded-lg border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5"
                >
                  Close my account
                </a>
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
