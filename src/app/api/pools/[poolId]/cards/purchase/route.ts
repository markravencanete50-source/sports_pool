import { createClient } from "@/lib/supabase/server";
import { getPoolForUser } from "@/lib/pool-access";
import { getPoolFinancials } from "@/lib/pool-financials";
import { NextResponse } from "next/server";
import { z } from "zod";

const purchaseCardSchema = z.object({
  entryFee: z.number().min(20, "Entry fee must be at least $20"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const { poolId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = purchaseCardSchema.parse(body);

    const { data: pool } = await getPoolForUser(supabase, poolId, user.id, "*");

    if (!pool) {
      return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    }

    if (pool.status !== "open" && pool.status !== "active") {
      return NextResponse.json(
        { error: "Pool is not accepting new cards" },
        { status: 400 }
      );
    }

    const { data: existingCards, error: cardsError } = await supabase
      .from("parlay_cards")
      .select("card_number")
      .eq("pool_id", poolId)
      .eq("user_id", user.id)
      .in("status", ["pending", "active", "completed"]);

    if (cardsError) {
      return NextResponse.json(
        { error: "Failed to check existing cards" },
        { status: 500 }
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

    if (existingCards && existingCards.length >= 3) {
      return NextResponse.json(
        { error: "Maximum 3 cards per user per pool" },
        { status: 400 }
      );
    }

    const existingCardNumbers = existingCards?.map((c) => c.card_number) || [];
    const nextCardNumber =
      [1, 2, 3].find((num) => !existingCardNumbers.includes(num)) ||
      existingCards!.length + 1;

    if (nextCardNumber > 3) {
      return NextResponse.json(
        { error: "Maximum 3 cards per user per pool" },
        { status: 400 }
      );
    }

    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    const minimumEntryFee = platformSettings?.minimum_entry_fee || 20.0;
    if (validatedData.entryFee < minimumEntryFee) {
      return NextResponse.json(
        { error: `Entry fee must be at least $${minimumEntryFee}` },
        { status: 400 }
      );
    }

    const { data: card, error: cardError } = await supabase
      .from("parlay_cards")
      .insert({
        pool_id: poolId,
        user_id: user.id,
        card_number: nextCardNumber,
        entry_fee_paid: validatedData.entryFee,
        status: "pending",
      })
      .select()
      .single();

    if (cardError || !card) {
      return NextResponse.json(
        { error: cardError?.message || "Failed to create card" },
        { status: 400 }
      );
    }

    const { error: transactionError } = await supabase
      .from("pool_transactions")
      .insert({
        pool_id: poolId,
        user_id: user.id,
        card_id: card.id,
        amount: validatedData.entryFee,
        platform_fee: 0,
        net_amount: validatedData.entryFee,
        status: "completed",
      });

    if (transactionError) {
      await supabase.from("parlay_cards").delete().eq("id", card.id);
      return NextResponse.json(
        { error: "Failed to create transaction" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        card,
        message: "Card purchased successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Purchase card error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
