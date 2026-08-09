import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Public winners ticker (rendered on the marketing page, so unauthenticated
 * callers are expected and supported).
 *
 * This route previously built a SERVICE-ROLE client — which bypasses RLS
 * entirely — with no auth check and no pool-status filter. RLS deliberately
 * exposes pool_winners only for COMPLETED pools; this returned winner name,
 * avatar, amount and pool for IN-FLIGHT pools too, to anyone on the internet.
 *
 * It was also broken: it embedded `users(id, name, avatar)`, which PostgREST
 * cannot resolve, because pool_winners has two foreign keys to users
 * (user_id and approved_by). The embed was ambiguous, so the request errored
 * and the ticker silently rendered nothing.
 *
 * Both are fixed by asking the database for the public projection rather than
 * for the table. public.get_public_winners() filters to completed pools and is
 * the only thing `anon` may call — pool_winners itself is not readable by anon
 * — so this route cannot widen the exposure, whatever it is later edited to do.
 *
 * Note it returns pool_winners.id, not users.id: the ticker only needs a stable
 * React key, and there is no reason to broadcast user UUIDs publicly.
 */

type PublicWinnerRow = {
  winner_id: string;
  winner_name: string | null;
  winner_avatar: string | null;
  amount_won: number | string;
  pool_name: string | null;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requested = parseInt(searchParams.get("limit") || "10", 10);
    const limit = Math.min(
      100,
      Math.max(1, Number.isFinite(requested) ? requested : 10)
    );

    // Session client, not the service role: RLS and the function's own EXECUTE
    // grant both apply. For a logged-out visitor this runs as `anon`.
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("get_public_winners", {
      p_limit: limit,
    });

    if (error) {
      // Log the cause, return a generic message. The previous version echoed
      // error.message and a `details` field straight to the caller.
      console.error("[winners] get_public_winners failed:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch winners" },
        { status: 500 }
      );
    }

    const winners = ((data ?? []) as PublicWinnerRow[]).map((row) => ({
      id: row.winner_id,
      name: row.winner_name ?? "Anonymous",
      avatar: row.winner_avatar ?? null,
      amount: Number(row.amount_won),
      poolName: row.pool_name ?? "",
    }));

    return NextResponse.json({ winners }, { status: 200 });
  } catch (error) {
    console.error(
      "[winners] unexpected error:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      { error: "Failed to fetch winners" },
      { status: 500 }
    );
  }
}
