import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { materializePoolWinners } from "@/lib/materialize-winners";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userCards } = await supabase
      .from("parlay_cards")
      .select("id, pool_id")
      .eq("user_id", user.id)
      .in("status", ["active", "completed"]);

    if (!userCards?.length) {
      return NextResponse.json({ winnings: [] }, { status: 200 });
    }

    const poolIds = [...new Set(userCards.map((c) => c.pool_id))];

    const { data: completedPools } = await supabase
      .from("pools")
      .select("id, name")
      .eq("status", "completed")
      .in("id", poolIds);

    const winnings: Array<{
      poolId: string;
      poolName: string;
      amount: number;
      correct: number;
      total: number;
      winningCardId?: string;
    }> = [];

    for (const pool of completedPools ?? []) {
      let { data: myWin } = await supabase
        .from("pool_winners")
        .select("pool_id, correct, total, amount, winning_card_id")
        .eq("pool_id", pool.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!myWin) {
        await materializePoolWinners(supabase, pool.id);
        const retry = await supabase
          .from("pool_winners")
          .select("pool_id, correct, total, amount, winning_card_id")
          .eq("pool_id", pool.id)
          .eq("user_id", user.id)
          .maybeSingle();
        myWin = retry.data ?? null;
      }

      if (myWin) {
        winnings.push({
          poolId: pool.id,
          poolName: pool.name,
          amount: Number(myWin.amount),
          correct: myWin.correct,
          total: myWin.total,
          winningCardId: myWin.winning_card_id ?? undefined,
        });
      }
    }

    winnings.sort((a, b) => b.amount - a.amount);

    return NextResponse.json({ winnings }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
