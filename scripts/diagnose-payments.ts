/** Read-only processor diagnostics. Safe for live mode; never creates charges. */
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function report(check: string, detail: unknown) {
  console.log(JSON.stringify({ check, detail }));
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  report("configuration", {
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    databaseHost: process.env.NEXT_PUBLIC_SUPABASE_URL,
    stripeMode: /^(sk|rk)_live_/.test(key ?? "") ? "live" : /^(sk|rk)_test_/.test(key ?? "") ? "test" : "invalid",
    keyHasWhitespace: key !== process.env.STRIPE_SECRET_KEY,
    webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
  });
  if (!key) throw new Error("Stripe key is missing");
  const stripe = new Stripe(key, { maxNetworkRetries: 1, timeout: 15_000 });
  const checks: Record<string, () => Promise<unknown>> = {
    account: async () => {
      const account = await stripe.accounts.retrieve(null);
      return {
        id: account.id, name: account.business_profile?.name ?? account.settings?.dashboard?.display_name,
        chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted, capabilities: account.capabilities,
        disabledReason: account.requirements?.disabled_reason,
        currentlyDue: account.requirements?.currently_due,
      };
    },
    recentPayments: async () => {
      const intents = await stripe.paymentIntents.list({ limit: 100 });
      const counts: Record<string, number> = {};
      for (const intent of intents.data) {
        const category = [intent.livemode ? "live" : "test", intent.status, intent.last_payment_error?.code, intent.last_payment_error?.decline_code].filter(Boolean).join(":");
        counts[category] = (counts[category] ?? 0) + 1;
      }
      return { counts, hasMore: intents.has_more };
    },
    recentCheckout: async () => {
      const sessions = await stripe.checkout.sessions.list({ limit: 100 });
      const counts: Record<string, number> = {};
      for (const session of sessions.data) {
        const category = `${session.livemode ? "live" : "test"}:${session.status}:${session.payment_status}`;
        counts[category] = (counts[category] ?? 0) + 1;
      }
      return { counts, hasMore: sessions.has_more };
    },
    webhooks: async () => {
      const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
      return endpoints.data.map((endpoint) => ({ url: endpoint.url, status: endpoint.status, live: endpoint.livemode, events: endpoint.enabled_events }));
    },
    ledger: async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !secret) throw new Error("Database credentials missing");
      const db = createClient(url, secret, { auth: { persistSession: false } });
      const { data, error } = await db.from("pool_transactions").select("stripe_session_id,card_id,status").order("created_at", { ascending: false }).limit(1000);
      if (error) throw new Error(error.message);
      const sessions = new Set<string>();
      let duplicates = 0;
      let missingCards = 0;
      for (const row of data ?? []) {
        if (row.stripe_session_id) {
          if (sessions.has(row.stripe_session_id)) duplicates++;
          sessions.add(row.stripe_session_id);
        }
        if (row.status === "completed" && !row.card_id) missingCards++;
      }
      return { sampled: data?.length, duplicateStripeSessions: duplicates, completedWithoutCard: missingCards };
    },
  };
  await Promise.all(Object.entries(checks).map(async ([name, run]) => {
    try { report(name, await run()); }
    catch (error) { report(name, { error: error instanceof Stripe.errors.StripeError ? { type: error.type, code: error.code, message: error.message } : error instanceof Error ? error.message : "Unknown diagnostic error" }); }
  }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

