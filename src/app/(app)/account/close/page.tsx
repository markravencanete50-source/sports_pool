"use client";

import { useState } from "react";
import Layout from "@/components/layout";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

/*
 * Account closure. The confirmation is a typed phrase rather than a checkbox
 * because this is irreversible and the failure mode of a mis-click is losing
 * access to an account that may hold money.
 *
 * The server does the real work and enforces the three refusals a user cannot
 * talk their way past: an outstanding balance, a payout in flight, and an
 * active self-exclusion. Those are explained here up front rather than only
 * surfaced as an error, so nobody types the phrase and then discovers a wall.
 */
export default function CloseAccountPage() {
  const [phrase, setPhrase] = useState("");
  const [working, setWorking] = useState(false);
  const router = useRouter();

  const submit = async () => {
    setWorking(true);
    try {
      const res = await fetch("/api/me/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not close your account");
      toast.success(json.message);
      setTimeout(() => router.push("/"), 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not close your account");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
        <h1 className="text-3xl font-bold">Close your account</h1>

        <div className="glass-panel rounded-xl p-6 space-y-4 text-sm text-muted-foreground">
          <p>
            Closing your account removes your name, email and date of birth, and
            signs you out permanently. You will not be able to log back in.
          </p>
          <p>
            Your transaction history is kept in anonymised form. Financial
            regulation requires us to retain it, and it can no longer be linked
            back to you once your details are removed.
          </p>
          <p className="text-foreground font-semibold">We cannot close your account while:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>you still have a balance — withdraw it first, or it becomes unreachable;</li>
            <li>a withdrawal is still being processed;</li>
            <li>a self-exclusion is active — closing would undo the protection you asked for.</li>
          </ul>
        </div>

        <div className="space-y-2">
          <label htmlFor="close-confirm" className="text-xs font-mono uppercase text-muted-foreground">
            Type CLOSE MY ACCOUNT to confirm
          </label>
          <input
            id="close-confirm"
            type="text"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/20 px-4 py-3 focus:outline-none focus:ring-1 focus:ring-destructive"
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={phrase !== "CLOSE MY ACCOUNT" || working}
          className="rounded-lg bg-destructive px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {working ? "Closing…" : "Close my account permanently"}
        </button>
      </div>
    </Layout>
  );
}
