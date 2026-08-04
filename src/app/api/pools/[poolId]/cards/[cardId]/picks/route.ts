import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const submitCardPickSchema = z.object({
  gameId: z.string(),
  prediction: z.enum(["home_win", "away_win", "tie"]),
  totalScorePrediction: z.number().int().positive().max(200).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ poolId: string; cardId: string }> }
) {
  try {
    const { poolId, cardId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = submitCardPickSchema.parse(body);

    const { data: card, error: cardError } = await supabase
      .from("parlay_cards")
      .select("*")
      .eq("id", cardId)
      .eq("user_id", user.id)
      .eq("pool_id", poolId)
      .single();

    if (cardError || !card) {
      return NextResponse.json(
        { error: "Card not found or access denied" },
        { status: 404 }
      );
    }

    if (card.status !== "pending") {
      return NextResponse.json(
        { error: "Card is no longer editable" },
        { status: 400 }
      );
    }

    const { data: pool, error: poolError } = await supabase
      .from("pools")
      .select("status")
      .eq("id", poolId)
      .single();

    if (!poolError && pool?.status === "completed") {
      return NextResponse.json(
        { error: "Pool is closed; picks cannot be submitted" },
        { status: 400 }
      );
    }

    const { data: poolGame } = await supabase
      .from("pool_games")
      .select("game_id")
      .eq("pool_id", poolId)
      .eq("game_id", validatedData.gameId)
      .single();

    if (!poolGame) {
      return NextResponse.json(
        { error: "Game is not part of this pool" },
        { status: 400 }
      );
    }

    const { data: existingPick } = await supabase
      .from("card_picks")
      .select("id")
      .eq("card_id", cardId)
      .eq("game_id", validatedData.gameId)
      .single();

    if (existingPick) {
      const { data, error } = await supabase
        .from("card_picks")
        .update({
          prediction: validatedData.prediction,
          total_score_prediction: validatedData.totalScorePrediction,
        })
        .eq("id", existingPick.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }

      return NextResponse.json({ pick: data }, { status: 200 });
    } else {
      const { data, error } = await supabase
        .from("card_picks")
        .insert({
          card_id: cardId,
          game_id: validatedData.gameId,
          prediction: validatedData.prediction,
          total_score_prediction: validatedData.totalScorePrediction,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }

      return NextResponse.json({ pick: data }, { status: 201 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Submit card pick error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ poolId: string; cardId: string }> }
) {
  try {
    const { poolId, cardId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // SECURITY (IDOR): this previously queried card_picks by cardId alone.
    // poolId was destructured and never used, and the caller's identity was
    // never compared to the card's owner — so any authenticated account,
    // including one that had never paid, could read any card's picks by id.
    // Card privacy is the product's hardest requirement; do not rely on RLS
    // alone to enforce it here.
    //
    // Resolve the card and bind it to BOTH the caller and the pool in the URL
    // first. Same pattern the POST handler in this file already uses.
    const { data: ownedCard } = await supabase
      .from("parlay_cards")
      .select("id")
      .eq("id", cardId)
      .eq("user_id", user.id)
      .eq("pool_id", poolId)
      .maybeSingle();

    if (!ownedCard) {
      // 404, not 403 — do not confirm that someone else's card id exists.
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const { data: picks, error: picksError } = await supabase
      .from("card_picks")
      .select(`
        *,
        games (
          id,
          home_team_id,
          away_team_id,
          date,
          status,
          home_score,
          away_score
        )
      `)
      .eq("card_id", ownedCard.id);

    if (picksError) {
      return NextResponse.json(
        { error: picksError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ picks: picks || [] }, { status: 200 });
  } catch (error) {
    console.error("Get card picks error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
