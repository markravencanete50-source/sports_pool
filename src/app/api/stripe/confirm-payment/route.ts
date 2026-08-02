import { createClient } from "@/lib/supabase/server";
import { getPoolForUser } from "@/lib/pool-access";
import { getStripe } from "@/lib/stripe/config";
import { confirmPaymentSchema } from "@/lib/validations";
import { NextResponse } from "next/server";
import { z } from "zod";

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
    const parsed = confirmPaymentSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "Validation error";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const { sessionId } = parsed.data;

    const session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Payment not completed" },
        { status: 400 }
      );
    }

    const paymentIdFromStripe =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as { id?: string } | null)?.id ?? session.id;

    const poolId = session.metadata?.poolId;
    const userId = session.metadata?.userId;
    const entryFeeRaw = session.metadata?.entryFee;

    if (!poolId || !userId || entryFeeRaw == null || entryFeeRaw === "") {
      return NextResponse.json(
        { error: "Invalid session metadata" },
        { status: 400 }
      );
    }

    if (userId !== user.id) {
      return NextResponse.json(
        { error: "Session does not belong to this user" },
        { status: 403 }
      );
    }

    const entryFee = Number(entryFeeRaw);
    if (!Number.isFinite(entryFee) || entryFee < 20) {
      return NextResponse.json(
        { error: "Invalid entry fee in session" },
        { status: 400 }
      );
    }

    const amountPaidCents = session.amount_total ?? 0;
    const expectedCents = Math.round(entryFee * 100);
    if (amountPaidCents !== expectedCents) {
      return NextResponse.json(
        { error: "Payment amount mismatch" },
        { status: 400 }
      );
    }

    const { data: existingTx } = await supabase
      .from("pool_transactions")
      .select("id, card_id")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    if (existingTx) {
      const existingCard = existingTx.card_id
        ? (await supabase.from("parlay_cards").select("*").eq("id", existingTx.card_id).single()).data
        : null;
      return NextResponse.json({
        card: existingCard,
        message: "Payment already confirmed",
      });
    }

    const { data: pool } = await getPoolForUser(
      supabase,
      poolId,
      user.id,
      "id, status, max_participants"
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

    const existingCardNumbers = existingCards?.map((c) => c.card_number) ?? [];
    const nextCardNumber = [1, 2, 3].find(
      (n) => !existingCardNumbers.includes(n)
    );
    if (nextCardNumber == null || (existingCards?.length ?? 0) >= 3) {
      return NextResponse.json(
        { error: "Maximum 3 cards per user per pool" },
        { status: 400 }
      );
    }

    const { data: card, error: cardError } = await supabase
      .from("parlay_cards")
      .insert({
        pool_id: poolId,
        user_id: user.id,
        card_number: nextCardNumber,
        entry_fee_paid: entryFee,
        status: "pending",
      })
      .select()
      .single();

    if (cardError || !card) {
      return NextResponse.json(
        { error: cardError?.message ?? "Failed to create card" },
        { status: 500 }
      );
    }

    const { error: txError } = await supabase.from("pool_transactions").insert({
      pool_id: poolId,
      user_id: user.id,
      card_id: card.id,
      amount: entryFee,
      platform_fee: 0,
      net_amount: entryFee,
      status: "completed",
      stripe_session_id: sessionId,
      payment_id: paymentIdFromStripe,
    });

    if (txError) {
      await supabase.from("parlay_cards").delete().eq("id", card.id);
      return NextResponse.json(
        { error: "Failed to record transaction" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      card,
      message: "Payment confirmed and card created",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
