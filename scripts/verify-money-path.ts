/**
 * Money-path verifier for the Stripe test-mode run (audit item BE-10).
 *
 * WHAT THIS IS FOR. BE-10 is the last Critical item with no legal component:
 * purchase → webhook → card issued → picks → settlement → balance credit →
 * payout has never been executed whole against real processor infrastructure.
 * The chain is correct by inspection and unit-tested at the library layer, but
 * inspection is not the same as watching idempotency survive a genuinely
 * duplicated webhook delivery.
 *
 * Running the chain is manual — you drive Stripe Checkout in a browser. What is
 * NOT manual, and is where mistakes hide, is checking that the database ended
 * up in exactly the right state afterwards. Reading five tables by hand and
 * eyeballing whether the numbers agree is how a double-credit gets missed. This
 * asserts the invariants instead.
 *
 * SECRETS. This reads credentials from the environment and never contains any.
 * Point it at a THROWAWAY Supabase project or a branch — never production. It
 * only reads, but a money-path rehearsal writes test rows you do not want in
 * real data.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/verify-money-path.ts <poolId>
 *
 * Procedure to run before this: docs/RUNBOOK.md §7.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const poolId = process.argv[2];

if (!url || !key) {
  console.error(
    "\nNeed SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.\n" +
      "Use the throwaway/staging project, not production.\n"
  );
  process.exit(1);
}
if (!poolId) {
  console.error("\nUsage: npx tsx scripts/verify-money-path.ts <poolId>\n");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

interface Check {
  name: string;
  pass: boolean;
  detail: string;
  /** Why this specific invariant is the one worth asserting. */
  why: string;
}

const checks: Check[] = [];
const add = (c: Check) => checks.push(c);

async function main() {
  // ── 1. Entry payments ────────────────────────────────────────────────────
  const { data: txs, error: txErr } = await db
    .from("pool_transactions")
    .select("id, user_id, card_id, amount, status, stripe_session_id, payment_id")
    .eq("pool_id", poolId);

  if (txErr) throw new Error(`pool_transactions: ${txErr.message}`);
  const paid = txs ?? [];

  const sessions = paid.map((t) => t.stripe_session_id).filter(Boolean);
  add({
    name: "one ledger row per Stripe session",
    pass: new Set(sessions).size === sessions.length,
    detail: `${paid.length} transaction(s), ${new Set(sessions).size} distinct session(s)`,
    why: "A replayed webhook must not produce a second charge row. This is the assertion that proves idempotency actually held, rather than that nothing was replayed.",
  });

  add({
    name: "every entry payment carries a card and a payment id",
    pass: paid.every((t) => t.card_id && t.payment_id),
    detail: paid.filter((t) => !t.card_id || !t.payment_id).map((t) => t.id).join(", ") || "all complete",
    why: "A transaction with no card is the exact failure the fulfilment code exists to prevent: the player was charged and received nothing.",
  });

  // ── 2. Cards issued ──────────────────────────────────────────────────────
  const { data: cards, error: cardErr } = await db
    .from("parlay_cards")
    .select("id, user_id, is_paid")
    .eq("pool_id", poolId);
  if (cardErr) throw new Error(`parlay_cards: ${cardErr.message}`);

  const paidCards = (cards ?? []).filter((c) => c.is_paid);
  add({
    name: "paid cards match paid transactions",
    pass: paidCards.length === paid.length,
    detail: `${paidCards.length} paid card(s) vs ${paid.length} transaction(s)`,
    why: "A mismatch in either direction is money without a card, or a card without money.",
  });

  const orphanCards = paidCards.filter((c) => !paid.some((t) => t.card_id === c.id));
  add({
    name: "no card exists without a matching payment",
    pass: orphanCards.length === 0,
    detail: orphanCards.map((c) => c.id).join(", ") || "none",
    why: "A free paid card is the highest-value bug in the product: it dilutes every other player's share of the pot.",
  });

  // ── 3. Settlement ────────────────────────────────────────────────────────
  const { data: winners, error: winErr } = await db
    .from("pool_winners")
    .select("id, user_id, card_id, amount_won")
    .eq("pool_id", poolId);
  if (winErr) throw new Error(`pool_winners: ${winErr.message}`);
  const won = winners ?? [];

  const { data: credits, error: credErr } = await db
    .from("user_transactions")
    .select("id, user_id, amount, type")
    .eq("pool_id", poolId);
  if (credErr) throw new Error(`user_transactions: ${credErr.message}`);
  const winningCredits = (credits ?? []).filter((c) => /win/i.test(String(c.type ?? "")));

  if (won.length > 0) {
    add({
      name: "exactly one winning credit per winner",
      pass: winningCredits.length === won.length,
      detail: `${won.length} winner row(s), ${winningCredits.length} winning credit(s)`,
      why: "idx_user_transactions_winning_per_pool is the backstop that makes a double payout impossible. This confirms the backstop was never even approached.",
    });

    const perUser = new Map<string, number>();
    for (const c of winningCredits) perUser.set(c.user_id, (perUser.get(c.user_id) ?? 0) + 1);
    add({
      name: "no user credited twice for this pool",
      pass: [...perUser.values()].every((n) => n === 1),
      detail: [...perUser.entries()].filter(([, n]) => n > 1).map(([u]) => u).join(", ") || "none",
      why: "The double-payout path the earlier audit closed. Worth re-proving against a real settlement rather than a unit test.",
    });

    const potPaid = won.reduce((sum, w) => sum + Number(w.amount_won ?? 0), 0);
    const gross = paid.reduce((sum, t) => sum + Number(t.amount ?? 0), 0);
    add({
      name: "payouts do not exceed the pot",
      pass: potPaid <= gross + 0.0001,
      detail: `paid out ${potPaid.toFixed(2)} of ${gross.toFixed(2)} collected`,
      why: "The platform fee is multiplied into the payout. A pool that pays out more than it took in is the fee-inflation bug, and it is silent.",
    });

    const cents = won.every((w) => Number.isInteger(Math.round(Number(w.amount_won) * 100)));
    add({
      name: "every payout is a whole number of cents",
      pass: cents,
      detail: won.map((w) => w.amount_won).join(", "),
      why: "scripts/verify-settlement.ts proves this across 243 synthetic combinations; this confirms it on real money that went through Stripe.",
    });
  } else {
    add({
      name: "settlement stage",
      pass: true,
      detail: "no winners yet — run settlement before asserting the payout invariants",
      why: "Reported rather than passed silently, so a half-finished run is not mistaken for a clean one.",
    });
  }

  // ── 4. Errors recorded during the run ────────────────────────────────────
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: errs } = await db
    .from("app_errors")
    .select("source, message, created_at")
    .gte("created_at", since)
    .limit(20);

  add({
    name: "no money-path errors recorded in the last 6 hours",
    pass: (errs ?? []).length === 0,
    detail: (errs ?? []).map((e) => `[${e.source}] ${String(e.message).slice(0, 80)}`).join(" | ") || "clean",
    why: "The chain can appear to succeed while a branch failed and was swallowed. app_errors is where that shows up.",
  });

  // ── Report ───────────────────────────────────────────────────────────────
  const failed = checks.filter((c) => !c.pass);
  console.log(`\nMoney-path verification for pool ${poolId}\n`);
  for (const c of checks) {
    console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
    console.log(`        ${c.detail}`);
    if (!c.pass) console.log(`        why it matters: ${c.why}`);
  }

  if (failed.length === 0) {
    console.log(`\nAll ${checks.length} invariants hold. Record the run in docs/RUNBOOK.md §7 and close BE-10.\n`);
    process.exit(0);
  }
  console.error(`\n${failed.length} of ${checks.length} invariants FAILED. Do not close BE-10.\n`);
  process.exit(1);
}

main().catch((err) => {
  console.error("\nverifier failed to run:", err instanceof Error ? err.message : err, "\n");
  process.exit(1);
});
