import { NextResponse } from "next/server";

/**
 * REMOVED — this endpoint accepted predictions with no integrity checks at all.
 *
 * It misused the URL's cardId segment as a gameId and wrote the legacy `picks`
 * table with no kickoff check, no card-status check and no pool-status check,
 * so a participant could set or change a prediction after a game had started —
 * or after its result was publicly known. Nothing reads `picks` today (scoring,
 * settlement and display all use `card_picks`), but a live post-hoc-writable
 * prediction store is a hole any future feature reading the table would
 * inherit.
 *
 * The legitimate path is:
 *   POST /api/pools/[poolId]/cards/[cardId]/picks
 * which verifies card ownership and pending status, pool status, pool
 * membership of the game, and the per-game kickoff lock before writing
 * `card_picks`. The UI already uses that path (useSubmitCardPick); only the
 * unused useSubmitPick hook in use-pools.ts still referenced this route.
 *
 * Kept as an explicit 410 rather than deleted so that any caller still pointing
 * here fails loudly and closed instead of hitting a 404 that reads like a routing
 * bug.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "This endpoint has been removed. Submit picks via the card picks endpoint.",
      use: "/api/pools/[poolId]/cards/[cardId]/picks",
    },
    { status: 410 }
  );
}
