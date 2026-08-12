"use client";

import { useCallback, useEffect, useState } from "react";
import Layout from "@/components/layout";
import { toast } from "sonner";

/*
 * Two-factor enrolment.
 *
 * This page is the reason the MFA check in requireAdmin() is safe to enforce.
 * Admin money routes refuse a session that has no verified factor, so without
 * a reachable enrolment screen the first deploy would lock every admin out of
 * payout completion — with no way back in, because the way back in is behind
 * the same check. This page and /api/me/mfa are deliberately NOT behind it.
 *
 * Open to every signed-in user, not just admins: a second factor on an account
 * holding a cash balance is worth having whoever you are, and restricting it
 * would mean an admin loses the ability to enrol the moment their role changes.
 */

interface Factor {
  id: string;
  friendlyName: string | null;
  status: string;
  createdAt: string;
}

export default function SecurityPage() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [level, setLevel] = useState<{ current: string | null; next: string | null }>({
    current: null,
    next: null,
  });
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [pending, setPending] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/mfa");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setFactors(json.factors ?? []);
      setLevel({ current: json.currentLevel, next: json.nextLevel });
    } catch {
      toast.error("Could not load your security settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const verified = factors.filter((f) => f.status === "verified");
  const isProtected = verified.length > 0;

  const startEnrolment = async () => {
    setEnrolling(true);
    try {
      const res = await fetch("/api/me/mfa", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not start setup");
      setPending({ factorId: json.factorId, qrCode: json.qrCode, secret: json.secret });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start setup");
    } finally {
      setEnrolling(false);
    }
  };

  const confirmEnrolment = async () => {
    if (!pending) return;
    setEnrolling(true);
    try {
      const res = await fetch("/api/me/mfa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId: pending.factorId, code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "That code was not accepted");
      toast.success(json.message);
      setPending(null);
      setCode("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That code was not accepted");
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Security</h1>
          <p className="text-muted-foreground">
            Two-factor authentication. Required for admin accounts before
            approving payouts, changing roles, or editing pool settings.
          </p>
        </header>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <section className="glass-panel rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Authenticator app</h2>
                <p className="text-sm text-muted-foreground">
                  {isProtected
                    ? "Active on this account."
                    : "Not set up yet."}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  isProtected
                    ? "bg-primary/15 text-primary"
                    : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {isProtected ? "Protected" : "Not protected"}
              </span>
            </div>

            {isProtected && level.current !== "aal2" && (
              <p role="alert" className="text-sm text-amber-400">
                You have a second factor, but this session has not used it. Sign
                out and back in to complete admin actions.
              </p>
            )}

            {!pending && !isProtected && (
              <button
                type="button"
                onClick={startEnrolment}
                disabled={enrolling}
                className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {enrolling ? "Starting…" : "Set up two-factor authentication"}
              </button>
            )}

            {pending && (
              <div className="space-y-4 border-t border-white/10 pt-5">
                <ol className="space-y-4 text-sm">
                  <li>
                    <p className="font-semibold">1. Scan this with your authenticator app</p>
                    <p className="text-muted-foreground">
                      Google Authenticator, 1Password, Authy — any TOTP app works.
                    </p>
                    {pending.qrCode && (
                      /* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI from Supabase, nothing for the image optimizer to fetch */
                      <img
                        src={pending.qrCode}
                        alt="QR code for two-factor authentication setup"
                        className="mt-3 w-44 h-44 rounded-lg bg-white p-2"
                      />
                    )}
                  </li>
                  <li>
                    <p className="font-semibold">2. Or enter this key by hand</p>
                    <code className="mt-2 block break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-xs">
                      {pending.secret}
                    </code>
                    <p className="mt-1 text-muted-foreground">
                      Store it somewhere safe. It is shown once and cannot be
                      retrieved later.
                    </p>
                  </li>
                  <li className="space-y-2">
                    <label htmlFor="mfa-code" className="block font-semibold">
                      3. Enter the 6-digit code to confirm
                    </label>
                    <input
                      id="mfa-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      className="w-40 rounded-lg border border-white/10 bg-black/20 px-4 py-3 font-mono tracking-widest focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </li>
                </ol>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={confirmEnrolment}
                    disabled={code.length !== 6 || enrolling}
                    className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {enrolling ? "Verifying…" : "Confirm and activate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPending(null);
                      setCode("");
                    }}
                    className="rounded-lg border border-white/15 px-5 py-3 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isProtected && (
              <ul className="space-y-2 border-t border-white/10 pt-5 text-sm">
                {verified.map((f) => (
                  <li key={f.id} className="flex justify-between text-muted-foreground">
                    <span>{f.friendlyName || "Authenticator"}</span>
                    <span>Added {new Date(f.createdAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}
