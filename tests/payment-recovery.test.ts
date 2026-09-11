import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fulfillCardPurchase } from "../src/lib/fulfill-card-purchase";
import { checkoutConfigurationError, stripeKeyMode } from "../src/lib/stripe/config";

const session = {
  id: "cs_test_recovery", payment_status: "paid", currency: "usd", amount_total: 2000,
  payment_intent: "pi_test_recovery", metadata: { poolId: "pool", userId: "user", entryFee: "20" },
} as unknown as Stripe.Checkout.Session;

type Step = { table: string; data?: unknown; error?: { code?: string; message: string } };
function database(steps: Step[]) {
  const calls: string[] = [];
  const pending = [...steps];
  const client = {
    from(table: string) {
      const step = pending.shift();
      assert.ok(step, `unexpected query on ${table}`);
      assert.equal(table, step.table);
      const builder = new Proxy({}, {
        get(_target, method) {
          if (method === "then") {
            return (resolve: (value: unknown) => void) => resolve({ data: step.data ?? null, error: step.error ?? null });
          }
          return () => { calls.push(`${table}.${String(method)}`); return builder; };
        },
      });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls, done: () => assert.equal(pending.length, 0) };
}

test("production refuses test keys before a customer reaches card entry", () => {
  assert.match(checkoutConfigurationError("sk_test_fixture", "production")!, /test mode/);
  assert.equal(checkoutConfigurationError(" sk_live_fixture\n", "production"), null);
  assert.equal(checkoutConfigurationError("rk_live_fixture", "production"), null);
  assert.equal(checkoutConfigurationError("sk_test_fixture", "preview"), null);
  assert.ok(checkoutConfigurationError("", "production"));
  assert.equal(stripeKeyMode("sk_bogus"), "unset");
});

test("unpaid, wrong-currency, and amount-mismatched sessions never write cards", async () => {
  for (const patch of [{ payment_status: "unpaid" }, { currency: "eur" }, { amount_total: 100 }]) {
    const db = database([]);
    const result = await fulfillCardPurchase(db.client, { ...session, ...patch } as Stripe.Checkout.Session);
    assert.equal(result.ok, false);
    assert.equal(db.calls.length, 0);
  }
});

test("a repeated paid session returns the existing card without writing another", async () => {
  const db = database([{ table: "pool_transactions", data: { id: "tx", card_id: "card" } }]);
  assert.deepEqual(await fulfillCardPurchase(db.client, session), { ok: true, cardId: "card", alreadyFulfilled: true });
  assert.ok(db.calls.every((call) => !call.endsWith(".insert")));
  db.done();
});

test("database read failures are retriable and never treated as missing data", async () => {
  const reads: Step[] = [
    { table: "pool_transactions" },
    { table: "pools", data: { id: "pool", status: "open" } },
    { table: "parlay_cards", data: [] },
  ];
  for (let index = 0; index < reads.length; index++) {
    const db = database([...reads.slice(0, index), { table: reads[index].table, error: { message: "Temporary outage" } }]);
    const result = await fulfillCardPurchase(db.client, session);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 503);
    assert.ok(db.calls.every((call) => !call.endsWith(".insert")));
    db.done();
  }
});

const beforeInsert: Step[] = [
  { table: "pool_transactions" },
  { table: "pools", data: { id: "pool", status: "open" } },
  { table: "parlay_cards", data: [] },
];

test("a racing callback returns the winning card when the card slot is already taken", async () => {
  const db = database([...beforeInsert,
    { table: "parlay_cards", error: { code: "23505", message: "Card slot occupied" } },
    { table: "pool_transactions", data: { card_id: "winner" } },
  ]);
  assert.deepEqual(await fulfillCardPurchase(db.client, session), { ok: true, cardId: "winner", alreadyFulfilled: true });
  db.done();
});

test("a unique violation is not success unless this exact session was fulfilled", async () => {
  for (const winner of [null, { card_id: "winner" }]) {
    const db = database([...beforeInsert,
      { table: "parlay_cards", data: { id: "loser" } },
      { table: "pool_transactions", error: { code: "23505", message: "Conflicting transaction" } },
      { table: "card_picks" }, { table: "parlay_cards" },
      { table: "pool_transactions", data: winner },
    ]);
    const result = await fulfillCardPurchase(db.client, session);
    if (winner) assert.deepEqual(result, { ok: true, cardId: "winner", alreadyFulfilled: true });
    else { assert.equal(result.ok, false); if (!result.ok) assert.equal(result.status, 503); }
    assert.ok(db.calls.includes("parlay_cards.delete"));
    db.done();
  }
});

test("transaction failure compensates the card and remains retriable", async () => {
  const db = database([...beforeInsert,
    { table: "parlay_cards", data: { id: "card" } },
    { table: "pool_transactions", error: { message: "Temporary write failure" } },
    { table: "card_picks" }, { table: "parlay_cards" },
  ]);
  const result = await fulfillCardPurchase(db.client, session);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 500);
  assert.ok(db.calls.includes("parlay_cards.delete"));
  db.done();
});
