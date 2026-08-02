import { createClient } from "@/lib/supabase/server";
import { getPoolForUser } from "@/lib/pool-access";
import { getPoolFinancials } from "@/lib/pool-financials";
import { getStripe } from "@/lib/stripe/config";
import { createCheckoutSessionSchema } from "@/lib/validations";
import { NextResponse } from "next/server";
import { z } from "zod";

const getBaseUrl = (): string => {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("NEXT_PUBLIC_APP_URL is not set");
  return url.replace(/\/$/, "");
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createCheckoutSessionSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "Validation error";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const { poolId, entryFee } = parsed.data;

    const { data: pool } = await getPoolForUser(
      supabase,
      poolId,
      user.id,
      "id, status, max_participants, entry_fee"
    );

    if (!pool) {
      return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    }

    if (pool.status !== "open" && pool.status !== "active") {
      return NextResponse.json(
        { error: "Pool is not accepting new cards" },
        { status: 400 }
      );
    }

    const { data: existingCards } = await supabase
      .from("parlay_cards")
      .select("card_number")
      .eq("pool_id", poolId)
      .eq("user_id", user.id)
      .in("status", ["pending", "active", "completed"]);

    if (existingCards && existingCards.length >= 3) {
      return NextResponse.json(
        { error: "Maximum 3 cards per user per pool" },
        { status: 400 }
      );
    }

    if (pool.max_participants != null) {
      const financials = await getPoolFinancials(supabase, poolId);
      const isNewPayer = !existingCards?.length;
      const paidCountAfter =
        financials.paid_participant_count + (isNewPayer ? 1 : 0);
      if (paidCountAfter > pool.max_participants) {
        return NextResponse.json(
          { error: "Pool has reached maximum participants" },
          { status: 400 }
        );
      }
    }

    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select("minimum_entry_fee")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    const minimumEntryFee = platformSettings?.minimum_entry_fee ?? 20;
    if (entryFee < minimumEntryFee) {
      return NextResponse.json(
        { error: `Entry fee must be at least $${minimumEntryFee}` },
        { status: 400 }
      );
    }

    const baseUrl = getBaseUrl();
    const amountCents = Math.round(entryFee * 100);

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "Parlay Card",
              description: `Entry for pool`,
              images: [],
            },
          },
        },
      ],
      metadata: {
        poolId,
        userId: user.id,
        entryFee: String(entryFee),
      },
      success_url: `${baseUrl}/pool/${poolId}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pool/${poolId}`,
      customer_email: user.email ?? undefined,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Create checkout session error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
