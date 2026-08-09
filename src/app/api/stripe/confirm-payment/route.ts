import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfillCardPurchase } from "@/lib/fulfill-card-purchase";
import { getStripe } from "@/lib/stripe/config";
import { confirmPaymentSchema } from "@/lib/validations";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-guards";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Fast path: the browser came back from Stripe, so confirm immediately rather
 * than making the user wait for the webhook.
 *
 * This is NOT the source of truth — /api/stripe/webhook is. Both call the same
 * fulfillCardPurchase() so they cannot drift, and its two-layer idempotency
 * means whichever arrives second is a no-op.
 */
export async function POST(request: Request) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "stripe:confirm", RATE_LIMITS.paymentConfirm);
    if (limited) return limited;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = confirmPaymentSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "Validation error";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const { sessionId } = parsed.data;

    const session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    // Authorization: a signed-in user may only confirm THEIR OWN session.
    // Without this, any authenticated user could pass another user's session id
    // and have the resulting card attributed by metadata.
    if (session.metadata?.userId !== user.id) {
      return NextResponse.json(
        { error: "Session does not belong to this user" },
        { status: 403 }
      );
    }

    // Ownership is proven above, so fulfil with the service-role client — the
    // same client the webhook uses. This keeps both paths byte-identical
    // instead of one running under RLS and one not.
    const result = await fulfillCardPurchase(createAdminClient(), session);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const card = result.cardId
      ? (
          await supabase
            .from("parlay_cards")
            .select("*")
            .eq("id", result.cardId)
            .maybeSingle()
        ).data
      : null;

    return NextResponse.json({
      card,
      message: result.alreadyFulfilled
        ? "Payment already confirmed"
        : "Payment confirmed and card created",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }
    console.error("[confirm-payment]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
