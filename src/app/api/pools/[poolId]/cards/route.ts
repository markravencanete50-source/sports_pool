import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const { poolId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: cards, error: cardsError } = await supabase
      .from("parlay_cards")
      .select(`
        *,
        card_picks (
          id,
          game_id,
          prediction,
          total_score_prediction,
          games (
            id,
            home_team_id,
            away_team_id,
            date,
            status
          )
        )
      `)
      .eq("pool_id", poolId)
      .eq("user_id", user.id)
      .order("card_number", { ascending: true });

    if (cardsError) {
      return NextResponse.json(
        { error: cardsError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ cards: cards || [] }, { status: 200 });
  } catch (error) {
    console.error("Get cards error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
