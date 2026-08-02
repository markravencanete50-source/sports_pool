import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { PoolStatus } from "@/lib/enums";
import { completePoolIfAllGamesFinished } from "@/lib/pool-completion";
import { materializePoolWinners } from "@/lib/materialize-winners";

export async function POST() {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (auth instanceof NextResponse) return auth;

    const { data: pools, error: listError } = await supabase
      .from("pools")
      .select("id")
      .in("status", [PoolStatus.OPEN, PoolStatus.ACTIVE]);

    if (listError) {
      return NextResponse.json(
        { error: listError.message },
        { status: 500 }
      );
    }

    const poolIds = (pools ?? []).map((p: { id: string }) => p.id);
    const completedIds: string[] = [];

    for (const poolId of poolIds) {
      const completed = await completePoolIfAllGamesFinished(supabase, poolId);
      if (completed) {
        await materializePoolWinners(supabase, poolId);
        completedIds.push(poolId);
      }
    }

    return NextResponse.json(
      {
        message: "Pool completion check finished",
        completed: completedIds.length,
        poolIds: completedIds,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error completing pools:", error);
    return NextResponse.json(
      {
        error: "Failed to complete pools",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
