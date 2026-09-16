import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fulfillCardPurchase } from "../src/lib/fulfill-card-purchase";
import { checkoutConfigurationError, stripeKeyMode } from "../src/lib/stripe/config";
import { stripeAccountReady } from "../src/lib/stripe/readiness";
import { confirmCheckout } from "../src/lib/confirm-checkout";

const session = {
  id: "cs_test_recovery", payment_status: "paid", currency: "usd", amount_total: 2000,
  payment_intent: "pi_test_recovery", metadata: { poolId: "pool", userId: "user", entryFee: "20" },
} as unknown as Stripe.Checkout.Session;

test("production requires live keys and every non-production environment refuses live keys", () => {
  assert.match(checkoutConfigurationError("sk_test_fixture", "production")!, /test mode/);
  assert.equal(checkoutConfigurationError(" sk_live_fixture\n", "production"), null);
  assert.equal(checkoutConfigurationError("rk_live_fixture", "production"), null);
  assert.equal(checkoutConfigurationError("sk_test_fixture", "preview"), null);
  for (const environment of ["preview", "development", ""]) {
    assert.match(checkoutConfigurationError("sk_live_fixture", environment)!, /outside production/);
  }
  assert.ok(checkoutConfigurationError("", "production"));
  assert.equal(stripeKeyMode("sk_bogus"), "unset");
});

test("unpaid, wrong-currency, and amount-mismatched sessions never reach the database", async () => {
  const db = { rpc: () => assert.fail("invalid session reached database") } as unknown as SupabaseClient;
  for (const patch of [{ payment_status: "unpaid" }, { currency: "eur" }, { amount_total: 100 }, { metadata: {} }]) {
    assert.equal((await fulfillCardPurchase(db, { ...session, ...patch } as Stripe.Checkout.Session)).ok, false);
  }
});

test("fulfilment uses exactly one atomic RPC and passes Stripe-verified identifiers", async () => {
  let calls = 0;
  const db = { rpc: async (name: string, args: unknown) => {
    calls++;
    assert.equal(name, "fulfill_stripe_card_purchase");
    assert.deepEqual(args, { p_session_id: session.id, p_payment_id: session.payment_intent,
      p_pool_id: "pool", p_user_id: "user", p_entry_fee: 20, p_picks: null });
    return { data: { ok: true, cardId: "card", alreadyFulfilled: true }, error: null };
  } } as unknown as SupabaseClient;
  assert.deepEqual(await fulfillCardPurchase(db, session), { ok: true, cardId: "card", alreadyFulfilled: true });
  assert.equal(calls, 1);
});

test("database failures and malformed successes remain retriable, never phantom success", async () => {
  for (const result of [{ error: { message: "outage" } }, { data: null }, { data: { ok: true, cardId: null } }]) {
    const db = { rpc: async () => result } as unknown as SupabaseClient;
    const actual = await fulfillCardPurchase(db, session);
    assert.equal(actual.ok, false);
    if (!actual.ok) assert.equal(actual.status, 503);
  }
});

test("definitive payment-review failures propagate without creating a second purchase", async () => {
  const expected = { ok: false, status: 409, error: "Payment requires refund review" };
  const db = { rpc: async () => ({ data: expected }) } as unknown as SupabaseClient;
  assert.deepEqual(await fulfillCardPurchase(db, session), expected);
});

test("account readiness requires both charges and card capability, and fails closed on API errors", async () => {
  for (const account of [{ charges_enabled: false }, { charges_enabled: true, capabilities: {} }]) {
    const stripe = { accounts: { retrieve: async () => account } } as unknown as Stripe;
    assert.equal(await stripeAccountReady(stripe), false);
  }
  const good = { accounts: { retrieve: async () => ({ charges_enabled: true, capabilities: { card_payments: "active" } }) } } as unknown as Stripe;
  assert.equal(await stripeAccountReady(good), true);
  const broken = { accounts: { retrieve: async () => { throw new Error("outage"); } } } as unknown as Stripe;
  await assert.rejects(stripeAccountReady(broken));
});

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
test("browser confirmation retries network/503 failures until the card exists", async () => {
  let calls = 0;
  const send = (async () => {
    calls++;
    if (calls === 1) throw new Error("offline");
    if (calls === 2) return response(503, { error: "retry" });
    return response(200, { card: { id: "card" } });
  }) as typeof fetch;
  await confirmCheckout(session.id, new AbortController().signal, send, async () => {});
  assert.equal(calls, 3);
});
test("browser confirmation never retries ownership failures or calls a payment-creation endpoint", async () => {
  let calls = 0;
  const send = (async (url: string) => { calls++; assert.equal(url, "/api/stripe/confirm-payment"); return response(403, { error: "Not yours" }); }) as typeof fetch;
  await assert.rejects(confirmCheckout(session.id, new AbortController().signal, send, async () => {}), /Not yours/);
  assert.equal(calls, 1);
});
test("a 200 without a card is not success, and a refresh can attempt confirmation again", async () => {
  let calls = 0;
  const send = (async () => { calls++; return response(200, { card: null }); }) as typeof fetch;
  for (let reload = 0; reload < 2; reload++) await assert.rejects(confirmCheckout(session.id, new AbortController().signal, send, async () => {}), /do not pay again/);
  assert.equal(calls, 6);
});
test("unmounted confirmation stops before another request", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(confirmCheckout(session.id, controller.signal, (() => assert.fail("request after abort")) as typeof fetch));
});
