import { NextResponse } from "next/server";

/**
 * REMOVED — this endpoint issued PAID cards without taking any payment.
 *
 * It accepted a client-supplied `entryFee`, inserted a parlay_cards row, and
 * then inserted a pool_transactions row with status: "completed" — i.e. marked
 * as settled — without ever touching Stripe. Two consequences:
 *
 *   1. Any authenticated user could POST {entryFee: 20} and receive a real,
 *      paid-looking entry in any open pool for free, competing for a real pot.
 *   2. Because pool_transactions.amount feeds the pot calculation, the same
 *      call inflated the advertised prize with money nobody had paid.
 *
 * The legitimate purchase path is:
 *   POST /api/stripe/create-checkout-session  ->  Stripe Checkout
 *      -> POST /api/stripe/webhook            (server-authoritative fulfilment)
 *      -> POST /api/stripe/confirm-payment    (fast path when the tab returns)
 *
 * Both of those derive the amount from the Stripe session, never from the
 * client. The UI already uses that path (useStripeCheckout); only the legacy
 * use-cards.ts hook still referenced this route.
 *
 * Kept as an explicit 410 rather than deleted so that any caller still pointing
 * here fails loudly and closed instead of hitting a 404 that reads like a routing
 * bug.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "This endpoint has been removed. Card purchases must go through Stripe Checkout.",
      use: "/api/stripe/create-checkout-session",
    },
    { status: 410 }
  );
}
