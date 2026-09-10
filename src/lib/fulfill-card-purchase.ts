import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { decodeCheckoutPicks } from "@/lib/checkout-picks";

/**
 * Single source of truth for turning a PAID Stripe Checkout Session into a
 * parlay card + transaction.
 *
 * Called from two places that must never disagree:
 *   1. /api/stripe/webhook          (server-authoritative, fires even if the
 *                                    user closes the tab)
 *   2. /api/stripe/confirm-payment  (fast path when the browser does return)
 *
 * IDEMPOTENCY — two layers, because the two callers can race:
 *   a) a pre-INSERT lookup on stripe_session_id (cheap, catches the common case)
 *   b) the UNIQUE constraint on pool_transactions.stripe_session_id, whose
 *      violation (Postgres 23505) is treated as success.
 *
 * (b) is REQUIRED. Without the unique index there is a genuine window where the
 * webhook and the return page both pass the lookup and both insert, issuing two
 * cards for one payment. The rebuilt schema must ship:
 *
 *   ALTER TABLE pool_transactions
 *     ADD CONSTRAINT pool_transactions_stripe_session_id_key
 *     UNIQUE (stripe_session_id);
 */

export type FulfillResult =
  | { ok: true; cardId: string | null; alreadyFulfilled: boolean }
  | { ok: false; status: number; error: string };

const UNIQUE_VIOLATION = "23505";

export async function fulfillCardPurchase(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session
): Promise<FulfillResult> {
  if (session.payment_status !== "paid") {
    return { ok: false, status: 400, error: "Payment not completed" };
  }

  const poolId = session.metadata?.poolId;
  const userId = session.metadata?.userId;
  const entryFeeRaw = session.metadata?.entryFee;

  if (!poolId || !userId || entryFeeRaw == null || entryFeeRaw === "") {
    return { ok: false, status: 400, error: "Invalid session metadata" };
  }

  const entryFee = Number(entryFeeRaw);
  if (!Number.isFinite(entryFee) || entryFee < 20) {
    return { ok: false, status: 400, error: "Invalid entry fee in session" };
  }

  // Never trust metadata for the amount — compare against what Stripe says was
  // actually captured.
  const amountPaidCents = session.amount_total ?? 0;
  if (amountPaidCents !== Math.round(entryFee * 100)) {
    return { ok: false, status: 400, error: "Payment amount mismatch" };
  }

  let checkoutPicks: ReturnType<typeof decodeCheckoutPicks>;
  try {
    checkoutPicks = decodeCheckoutPicks(session.metadata);
  } catch {
    return { ok: false, status: 400, error: "Invalid picks in session metadata" };
  }

  const paymentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as { id?: string } | null)?.id ?? session.id;

  // (a) cheap idempotency check
  const { data: existingTx } = await supabase
    .from("pool_transactions")
    .select("id, card_id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  if (existingTx) {
    return { ok: true, cardId: existingTx.card_id ?? null, alreadyFulfilled: true };
  }

  const { data: pool } = await supabase
    .from("pools")
    .select("id, status")
    .eq("id", poolId)
    .maybeSingle();

  if (!pool) {
    return { ok: false, status: 404, error: "Pool not found" };
  }
  if (pool.status !== "open" && pool.status !== "active") {
    // The user has already been charged. Do NOT silently swallow this — it needs
    // an operator refund. Surfaced as 409 so the webhook logs it loudly.
    return {
      ok: false,
      status: 409,
      error: `Pool ${poolId} is ${pool.status}; payment ${session.id} needs a manual refund`,
    };
  }

  if (checkoutPicks) {
    const { data: poolGames, error: poolGamesError } = await supabase
      .from("pool_games")
      .select("game_id")
      .eq("pool_id", poolId);
    const poolGameIds = (poolGames ?? []).map(
      (poolGame: { game_id: string }) => poolGame.game_id,
    );
    const pickedGameIds = new Set(checkoutPicks.map((pick) => pick.gameId));
    if (
      poolGamesError ||
      poolGameIds.length === 0 ||
      pickedGameIds.size !== poolGameIds.length ||
      poolGameIds.some((gameId) => !pickedGameIds.has(gameId))
    ) {
      return {
        ok: false,
        status: 409,
        error: `Pool schedule changed; payment ${session.id} needs a manual refund`,
      };
    }

    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("id, date, status")
      .in("id", poolGameIds);
    const invalidGame = games?.find(
      (game) =>
        game.status !== "scheduled" ||
        !Number.isFinite(Date.parse(game.date)) ||
        Date.parse(game.date) <= Date.now(),
    );
    if (gamesError || !games || games.length !== poolGameIds.length || invalidGame) {
      return {
        ok: false,
        status: 409,
        error: `A selected game is no longer open; payment ${session.id} needs a manual refund`,
      };
    }
  }

  const { data: existingCards } = await supabase
    .from("parlay_cards")
    .select("card_number")
    .eq("pool_id", poolId)
    .eq("user_id", userId)
    .in("status", ["pending", "active", "completed"]);

  const taken = existingCards?.map((c) => c.card_number) ?? [];
  const nextCardNumber = [1, 2, 3].find((n) => !taken.includes(n));

  if (nextCardNumber == null || taken.length >= 3) {
    return {
      ok: false,
      status: 409,
      error: `User ${userId} already holds 3 cards in pool ${poolId}; payment ${session.id} needs a manual refund`,
    };
  }

  const { data: card, error: cardError } = await supabase
    .from("parlay_cards")
    .insert({
      pool_id: poolId,
      user_id: userId,
      card_number: nextCardNumber,
      entry_fee_paid: entryFee,
      status: checkoutPicks ? "active" : "pending",
    })
    .select()
    .single();

  if (cardError || !card) {
    return {
      ok: false,
      status: 500,
      error: cardError?.message ?? "Failed to create card",
    };
  }

  if (checkoutPicks) {
    const { error: picksError } = await supabase.from("card_picks").insert(
      checkoutPicks.map((pick) => ({
        card_id: card.id,
        game_id: pick.gameId,
        prediction: pick.prediction,
        total_score_prediction: pick.totalScorePrediction,
      })),
    );
    if (picksError) {
      await supabase.from("parlay_cards").delete().eq("id", card.id);
      return { ok: false, status: 500, error: "Failed to save paid card picks" };
    }
  }

  // platform_fee and net_amount are deliberately not set here. They used to be
  // written as `platform_fee: 0, net_amount: entryFee` on every sale, while
  // settlement paid the winner prize_pot * (1 - platform_fee_percentage/100).
  // The fee was genuinely being retained but recorded nowhere, so any revenue
  // figure taken from this table read $0.
  //
  // trg_set_pool_transaction_fee derives both from platform_settings at insert
  // time. Keeping it in the database means every write path records the fee, and
  // this path — the Stripe critical section — needs no extra round trip.
  //
  // That trigger AND the columns' defaults are created by migration
  // 20260807000001. Before it, both columns were NOT NULL with no default and no
  // trigger supplied them, so this insert failed 23502 on any database built
  // from the migrations — the player was charged and got no card. Do not drop
  // that migration without also setting the two columns explicitly here.
  const { error: txError } = await supabase.from("pool_transactions").insert({
    pool_id: poolId,
    user_id: userId,
    card_id: card.id,
    amount: entryFee,
    status: "completed",
    stripe_session_id: session.id,
    payment_id: paymentId,
  });

  if (txError) {
    // (b) the other caller won the race — its card stands, ours is a duplicate.
    if ((txError as { code?: string }).code === UNIQUE_VIOLATION) {
      await supabase.from("card_picks").delete().eq("card_id", card.id);
      await supabase.from("parlay_cards").delete().eq("id", card.id);
      return { ok: true, cardId: null, alreadyFulfilled: true };
    }
    await supabase.from("card_picks").delete().eq("card_id", card.id);
    await supabase.from("parlay_cards").delete().eq("id", card.id);
    return { ok: false, status: 500, error: "Failed to record transaction" };
  }

  return { ok: true, cardId: card.id, alreadyFulfilled: false };
}
