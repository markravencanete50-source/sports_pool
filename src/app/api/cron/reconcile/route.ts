import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { requireSecret } from "@/lib/require-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/config";
import { logEvent, recordAppError } from "@/lib/log";

/**
 * Scheduled payment reconciliation.
 *
 * The fulfilment and payout paths are individually idempotent, but nothing
 * previously CHECKED that the processor's records and our ledger still agree —
 * a silent divergence (a webhook Stripe gave up retrying, a row lost to a
 * partial failure, an operator mistake) would accumulate invisibly until a
 * player complained. This job pulls the two ends of each money flow and files
 * every mismatch in app_errors, where the operator will actually see it.
 *
 * Three checks, all bounded to a look-back window (with an hour of overlap so
 * boundary events are seen by two consecutive runs rather than zero):
 *
 *  1. Stripe -> ledger: every PAID checkout session must have a completed
 *     pool_transactions row carrying its session id. A missing row means a
 *     player paid and holds no card: refund or fulfil, by hand, today.
 *
 *  2. Ledger -> Stripe: every completed pool_transactions row written in the
 *     window must correspond to a paid Stripe session. The service role is the
 *     only writer, so a mismatch here means code regression or manual edit —
 *     either way the pot is advertising money nobody paid.
 *
 *  3. Completed payout_requests must carry a PayPal batch id (recorded in
 *     stripe_transfer_id — legacy column name, PayPal batch id since the
 *     PayPal migration). Blank means money left the balance with no traceable
 *     batch.
 *
 * Plus retention: app_errors rows older than 90 days are purged, per the
 * table's comment.
 *
 * READ-ONLY apart from that purge and the mismatch reports. Reconciliation
 * observes and alarms; it never "fixes" money records automatically, because a
 * wrong automatic fix is strictly worse than a loud mismatch.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const LOOKBACK_HOURS = 49; // daily schedule + 1h overlap

export async function GET(request: Request) {
  const denied = requireSecret(request, "CRON_SECRET");
  if (denied) return denied;

  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000);
  const admin = createAdminClient();
  const mismatches: string[] = [];

  // Unprovisioned is not broken. During the handover window the client holds
  // the Stripe account and the key may legitimately be absent; throwing here
  // would file a false "reconciliation failed" incident into app_errors on
  // every scheduled run. Skip the Stripe<->ledger checks LOUDLY (logged, and
  // named in the response) and still run the checks that need no processor.
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim());

  try {
    const { data: ledgerRows, error: ledgerError } = await admin
      .from("pool_transactions")
      .select("id, stripe_session_id, amount, status, created_at")
      .gte("created_at", since.toISOString());
    if (ledgerError) throw new Error(`ledger read failed: ${ledgerError.message}`);

    // ── 1 & 2. Stripe <-> pool_transactions ─────────────────────────────────
    const stripeSessions = new Map<string, Stripe.Checkout.Session>();
    if (!stripeConfigured) {
      logEvent("warn", "reconcile.stripe_skipped", {
        reason: "STRIPE_SECRET_KEY unset — Stripe<->ledger checks did not run",
      });
    } else {
      for await (const session of getStripe().checkout.sessions.list({
        created: { gte: Math.floor(since.getTime() / 1000) },
        limit: 100,
      })) {
        if (session.payment_status === "paid") {
          stripeSessions.set(session.id, session);
        }
      }

      const ledgerBySession = new Map(
        (ledgerRows ?? [])
          .filter((r) => r.stripe_session_id)
          .map((r) => [r.stripe_session_id as string, r])
      );

      for (const [sessionId, session] of stripeSessions) {
        const row = ledgerBySession.get(sessionId);
        if (!row) {
          mismatches.push(
            `PAID Stripe session ${sessionId} (${((session.amount_total ?? 0) / 100).toFixed(2)} ` +
              `${(session.currency ?? "usd").toUpperCase()}) has NO pool_transactions row — ` +
              `player may be charged without a card. Refund or fulfil manually.`
          );
        } else if (row.status !== "completed") {
          mismatches.push(
            `Stripe session ${sessionId} is paid but ledger row ${row.id} has status "${row.status}".`
          );
        }
      }

      for (const row of ledgerRows ?? []) {
        if (
          row.status === "completed" &&
          row.stripe_session_id &&
          !stripeSessions.has(row.stripe_session_id)
        ) {
          mismatches.push(
            `Ledger row ${row.id} (${row.amount}) references Stripe session ` +
              `${row.stripe_session_id} which is not a paid session in the window — ` +
              `possible fabricated or stale transaction feeding the pot.`
          );
        }
      }
    }

    // ── 3. Completed payouts must be traceable to a batch ───────────────────
    const { data: payoutRows, error: payoutError } = await admin
      .from("payout_requests")
      .select("id, amount, status, stripe_transfer_id, processed_at")
      .eq("status", "completed")
      .gte("processed_at", since.toISOString());
    if (payoutError) throw new Error(`payout read failed: ${payoutError.message}`);

    for (const p of payoutRows ?? []) {
      if (!p.stripe_transfer_id) {
        mismatches.push(
          `Completed payout request ${p.id} (${p.amount}) carries no PayPal batch id — ` +
            `money left the balance with no traceable batch.`
        );
      }
    }

    // ── Retention: purge error rows past 90 days ────────────────────────────
    const purgeBefore = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
    await admin.from("app_errors").delete().lt("created_at", purgeBefore);

    // ── Report ──────────────────────────────────────────────────────────────
    for (const m of mismatches) {
      logEvent("error", "reconcile.mismatch", { detail: m });
      await recordAppError({
        source: "server",
        message: `RECONCILIATION MISMATCH: ${m}`,
        url: "/api/cron/reconcile",
      });
    }

    logEvent(mismatches.length ? "error" : "info", "reconcile.finished", {
      stripeChecked: stripeConfigured,
      stripeSessionsPaid: stripeSessions.size,
      ledgerRows: ledgerRows?.length ?? 0,
      payoutsCompleted: payoutRows?.length ?? 0,
      mismatches: mismatches.length,
    });

    return NextResponse.json({
      since: since.toISOString(),
      stripeChecked: stripeConfigured,
      ...(stripeConfigured
        ? {}
        : { warning: "STRIPE_SECRET_KEY unset — Stripe<->ledger checks skipped" }),
      stripeSessionsPaid: stripeSessions.size,
      ledgerRows: ledgerRows?.length ?? 0,
      payoutsCompleted: payoutRows?.length ?? 0,
      mismatches,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logEvent("error", "reconcile.fatal", { reason: message });
    await recordAppError({
      source: "server",
      message: `Reconciliation run failed: ${message}`,
      url: "/api/cron/reconcile",
    });
    return NextResponse.json(
      { error: "Reconciliation failed", detail: message },
      { status: 500 }
    );
  }
}
