import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { decodeCheckoutPicks } from "@/lib/checkout-picks";

export type FulfillResult =
  | { ok: true; cardId: string; alreadyFulfilled: boolean }
  | { ok: false; status: number; error: string };

/** Both the signed webhook and the authenticated return path use this boundary. */
export async function fulfillCardPurchase(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<FulfillResult> {
  if (session.payment_status !== "paid") return { ok: false, status: 400, error: "Payment not completed" };
  if (session.currency !== "usd") return { ok: false, status: 400, error: "Payment currency mismatch" };
  const poolId = session.metadata?.poolId;
  const userId = session.metadata?.userId;
  const entryFee = Number(session.metadata?.entryFee);
  if (!poolId || !userId || !Number.isFinite(entryFee) || entryFee < 20) {
    return { ok: false, status: 400, error: "Invalid payment metadata" };
  }
  if (session.amount_total !== Math.round(entryFee * 100)) {
    return { ok: false, status: 400, error: "Payment amount mismatch" };
  }
  let picks: ReturnType<typeof decodeCheckoutPicks>;
  try { picks = decodeCheckoutPicks(session.metadata); }
  catch { return { ok: false, status: 400, error: "Invalid picks in session metadata" }; }

  const paymentId = typeof session.payment_intent === "string"
    ? session.payment_intent : session.payment_intent?.id ?? session.id;
  // One database transaction holds the pool lock, checks the exact session,
  // allocates a card slot, and writes picks + ledger. Errors roll EVERYTHING
  // back; HTTP calls followed by best-effort deletes cannot offer that guarantee.
  const { data, error } = await supabase.rpc("fulfill_stripe_card_purchase", {
    p_session_id: session.id, p_payment_id: paymentId, p_pool_id: poolId,
    p_user_id: userId, p_entry_fee: entryFee, p_picks: picks,
  });
  if (error || !data) return { ok: false, status: 503, error: "Payment processing is delayed. Please retry confirmation; do not pay again." };
  if (data.ok === true && typeof data.cardId === "string") {
    return { ok: true, cardId: data.cardId, alreadyFulfilled: data.alreadyFulfilled === true };
  }
  if (data.ok === false && typeof data.error === "string" && Number.isInteger(data.status)) {
    return data as FulfillResult;
  }
  return { ok: false, status: 503, error: "Could not verify payment fulfilment" };
}
