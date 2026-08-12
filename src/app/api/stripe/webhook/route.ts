import { createAdminClient } from "@/lib/supabase/admin";
import { fulfillCardPurchase } from "@/lib/fulfill-card-purchase";
import { recordAppError, logEvent } from "@/lib/log";
import { getStripe } from "@/lib/stripe/config";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

/**
 * Stripe webhook — the SERVER-SIDE SOURCE OF TRUTH for card fulfilment.
 *
 * Before this existed, a card was only created when the browser came back to
 * /api/stripe/confirm-payment. If the user paid and then closed the tab, lost
 * signal, or the redirect failed, they were charged and got nothing.
 *
 * Runtime notes:
 *  - nodejs runtime is required: signature verification needs the raw body and
 *    node:crypto.
 *  - Never parse the body before constructEvent(); the signature is over the
 *    exact bytes Stripe sent.
 *  - This route MUST stay outside any auth middleware — Stripe presents no
 *    session. Its authentication IS the signature.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    // Bad signature = not from Stripe. Do not leak why.
    console.error(
      "[stripe-webhook] signature verification failed:",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    // Acknowledge everything else so Stripe stops retrying.
    return NextResponse.json({ received: true, ignored: event.type });
  }

  try {
    const sessionId = (event.data.object as Stripe.Checkout.Session).id;

    // Re-retrieve from Stripe rather than trusting the event payload, and expand
    // payment_intent so the transaction records a real PI id.
    const session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    // No user session here, so this uses the service-role client. That bypasses
    // RLS by design; every value written is derived from Stripe, never from a
    // client request.
    const supabase = createAdminClient();
    const result = await fulfillCardPurchase(supabase, session);

    if (!result.ok) {
      // A charge landed that we could not turn into a card (pool closed, card
      // limit hit). Retrying will not fix it — ACK so Stripe stops, and log
      // loudly for operator refund.
      logEvent("error", "stripe.fulfilment_failed", {
        sessionId,
        reason: result.error,
      });
      await recordAppError({
        source: "server",
        message: `Stripe fulfilment failed — manual refund review required: ${result.error}`,
        digest: sessionId,
        url: "/api/stripe/webhook",
      });
      return NextResponse.json({ received: true, fulfilled: false });
    }

    console.info(
      `[stripe-webhook] session ${sessionId} fulfilled` +
        (result.alreadyFulfilled ? " (already done — idempotent no-op)" : "")
    );
    return NextResponse.json({ received: true, fulfilled: true });
  } catch (err) {
    // Transient (network/DB). Return 500 so Stripe RETRIES this one.
    console.error(
      "[stripe-webhook] transient error, asking Stripe to retry:",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json({ error: "Processing error" }, { status: 500 });
  }
}
