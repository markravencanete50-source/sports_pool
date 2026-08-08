import { NextResponse } from "next/server";

/**
 * REMOVED — legacy pick submission.
 *
 * This endpoint wrote to the legacy `picks` table, which the settlement engine
 * does NOT read (scoring runs off `card_picks` via materializePoolWinners). A
 * pick submitted here would be silently ignored when winners are computed — a
 * money-correctness trap in a real-money game.
 *
 * The live pick flow is:
 *   POST /api/pools/[poolId]/cards/[cardId]/picks   (writes card_picks)
 * used by the useSubmitCardPick hook. The only caller of this route
 * (useSubmitPick) has been removed.
 *
 * Kept as an explicit 410 rather than deleted so any straggler caller fails
 * loudly and closed instead of writing picks that never count.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "This endpoint has been removed. Submit picks via /api/pools/[poolId]/cards/[cardId]/picks.",
      use: "/api/pools/[poolId]/cards/[cardId]/picks",
    },
    { status: 410 }
  );
}
