/**
 * Preflight for the money-path run (audit item BE-10).
 *
 * WHAT THIS IS FOR. The money-path rehearsal is partly manual: somebody drives
 * Stripe Checkout in a browser, then scripts/verify-money-path.ts asserts the
 * database landed correctly. The expensive failure is starting that procedure
 * and discovering ten minutes in that a key is wrong, the webhook is pointed at
 * the wrong URL, or PayPal is still unconfigured — because by then there are
 * half-finished rows to clean up before trying again.
 *
 * This answers "are the credentials actually good" in a few seconds, before any
 * of that. Every check is READ-ONLY: it authenticates against each processor
 * and moves no money.
 *
 * Run it, get all green, then follow docs/RUNBOOK.md.
 *
 *   npm run preflight:money
 *
 * SAFETY. It REFUSES TO RUN against a live Stripe key. A rehearsal exists to be
 * done wrong the first time; doing it wrong against real cards is not a
 * rehearsal. Secrets are never printed — only their prefix and length.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

interface Check {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

const checks: Check[] = [];
const add = (name: string, status: Check["status"], detail: string) =>
  checks.push({ name, status, detail });

/** Show enough to identify a credential, never enough to use one. */
function fingerprint(value: string): string {
  const head = value.slice(0, 8);
  return `${head}… (${value.length} chars)`;
}

async function main() {
  // ── Stripe ────────────────────────────────────────────────────────────────
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (!stripeKey) {
    add("Stripe secret key", "fail", "STRIPE_SECRET_KEY is not set");
  } else if (stripeKey.startsWith("sk_live_")) {
    // Hard stop rather than a warning. This is the whole point of the guard.
    console.error(
      "\n  REFUSING TO RUN.\n\n" +
        "  STRIPE_SECRET_KEY is a LIVE key. The money-path rehearsal creates real\n" +
        "  charges with a live key, and it is a procedure designed to be got wrong\n" +
        "  the first time. Use the test-mode key (sk_test_…) from the same account.\n"
    );
    process.exit(2);
  } else if (!stripeKey.startsWith("sk_test_")) {
    add("Stripe secret key", "fail", `expected sk_test_…, got ${fingerprint(stripeKey)}`);
  } else {
    add("Stripe secret key", "pass", `test mode, ${fingerprint(stripeKey)}`);

    try {
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(stripeKey, { apiVersion: "2026-08-26.dahlia" });
      // Cheapest authenticated call that proves the key is live and usable.
      const balance = await stripe.balance.retrieve();
      add(
        "Stripe API reachable",
        "pass",
        `authenticated, livemode=${balance.livemode}`
      );
      if (balance.livemode) {
        add("Stripe mode", "fail", "the API reports LIVE mode — stop and use test credentials");
      }
    } catch (err) {
      add(
        "Stripe API reachable",
        "fail",
        err instanceof Error ? err.message.slice(0, 120) : String(err)
      );
    }
  }

  // ── Webhook secret ────────────────────────────────────────────────────────
  const whsec = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!whsec) {
    add(
      "Stripe webhook secret",
      "fail",
      "STRIPE_WEBHOOK_SECRET unset — the webhook answers 503 and NO purchase is ever fulfilled"
    );
  } else if (!whsec.startsWith("whsec_")) {
    add("Stripe webhook secret", "fail", `expected whsec_…, got ${fingerprint(whsec)}`);
  } else {
    add("Stripe webhook secret", "pass", fingerprint(whsec));
    // Cannot be validated without a delivery — it is per-endpoint, so the only
    // real proof is a signed event arriving. Say so rather than implying more.
    add(
      "Stripe webhook endpoint",
      "warn",
      "secret is present but only a real delivery proves it matches THIS endpoint — confirm during the run"
    );
  }

  // ── PayPal ────────────────────────────────────────────────────────────────
  const ppId = process.env.PAYPAL_CLIENT_ID?.trim();
  const ppSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  const ppMode = process.env.PAYPAL_MODE?.trim().toLowerCase();

  if (!ppId || !ppSecret) {
    add("PayPal credentials", "fail", "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set — payouts cannot be exercised");
  } else if (ppMode !== "sandbox") {
    add(
      "PayPal mode",
      "fail",
      `PAYPAL_MODE is "${ppMode ?? "unset"}" — a rehearsal must run against sandbox`
    );
  } else {
    add("PayPal credentials", "pass", `sandbox, client id ${fingerprint(ppId)}`);
    try {
      const auth = Buffer.from(`${ppId}:${ppSecret}`).toString("base64");
      const res = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${auth}`,
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        add("PayPal API reachable", "pass", "sandbox token issued");
      } else {
        add("PayPal API reachable", "fail", `token request returned ${res.status}`);
      }
    } catch (err) {
      add(
        "PayPal API reachable",
        "fail",
        err instanceof Error ? err.message.slice(0, 120) : String(err)
      );
    }
  }

  // ── Supabase service role ─────────────────────────────────────────────────
  const supaUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supaUrl || !supaKey) {
    add(
      "Supabase service role",
      "fail",
      "URL or SUPABASE_SERVICE_ROLE_KEY unset — settlement and fulfilment both die without it"
    );
  } else {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const db = createClient(supaUrl, supaKey, { auth: { persistSession: false } });
      const { error } = await db.from("platform_settings").select("id").limit(1);
      if (error) {
        add("Supabase service role", "fail", error.message.slice(0, 120));
      } else {
        add("Supabase service role", "pass", `reachable at ${new URL(supaUrl).host}`);
      }
    } catch (err) {
      add(
        "Supabase service role",
        "fail",
        err instanceof Error ? err.message.slice(0, 120) : String(err)
      );
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log("\nMoney-path preflight\n" + "─".repeat(74));
  for (const c of checks) {
    const mark = c.status === "pass" ? "PASS" : c.status === "warn" ? "WARN" : "FAIL";
    console.log(`  ${mark.padEnd(5)} ${c.name.padEnd(26)} ${c.detail}`);
  }

  const failed = checks.filter((c) => c.status === "fail");
  console.log("─".repeat(74));

  if (failed.length > 0) {
    console.log(
      `\n  ${failed.length} check(s) failed. Fix these before starting the run —\n` +
        `  every one of them breaks the chain somewhere it is expensive to discover.\n`
    );
    process.exit(1);
  }

  console.log(
    "\n  Credentials are good. Now run the chain (docs/RUNBOOK.md):\n\n" +
      "    1. Create a pool and buy a card through Stripe Checkout (test card\n" +
      "       4242 4242 4242 4242, any future expiry, any CVC).\n" +
      "    2. In the Stripe dashboard, RESEND the checkout.session.completed\n" +
      "       event. Fulfilment is idempotent; a second delivery must NOT issue\n" +
      "       a second card. This is the single most important assertion in the\n" +
      "       run and the reason it cannot be replaced by inspection.\n" +
      "    3. Submit picks, set final scores, let settlement run.\n" +
      "    4. Request a payout and approve it (PayPal sandbox).\n" +
      "    5. Assert the database landed correctly:\n" +
      "         npx tsx scripts/verify-money-path.ts <poolId>\n" +
      "    6. Run reconciliation and confirm it reports zero mismatches:\n" +
      '         curl -H "Authorization: Bearer $CRON_SECRET" <url>/api/cron/reconcile\n'
  );
}

main().catch((err) => {
  console.error("\npreflight failed to run:", err);
  process.exit(1);
});
