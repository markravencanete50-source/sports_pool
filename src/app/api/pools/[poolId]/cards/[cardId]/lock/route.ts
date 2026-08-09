import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

    const { data: card, error: cardError } = await supabase
      .from("parlay_cards")
      .select("id, status")
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
        { error: "Card is already locked or finalized" },
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

    const { data: poolGames } = await supabase
      .from("pool_games")
      .select("game_id")
      .eq("pool_id", poolId);

    const gameIds = (poolGames ?? []).map(
      (pg: { game_id: string }) => pg.game_id
    );
    const { data: picks } = await supabase
      .from("card_picks")
      .select("game_id")
      .eq("card_id", cardId);

    const pickedGameIds = new Set(
      (picks ?? []).map((p: { game_id: string }) => p.game_id)
    );
    const missing = gameIds.filter((id: string) => !pickedGameIds.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "Make a pick for every game before locking" },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("parlay_cards")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", cardId)
      .eq("user_id", user.id)
      .eq("pool_id", poolId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ card: updated }, { status: 200 });
  } catch (error) {
    console.error("Lock card error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
