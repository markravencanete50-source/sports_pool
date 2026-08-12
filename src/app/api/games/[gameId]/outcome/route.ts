import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { GameStatus } from "@/lib/enums";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Manually correct a game's outcome. ADMIN ONLY.
 *
 * SECURITY — this route previously authenticated but did not AUTHORIZE. It
 * checked only that a caller was signed in (the source comment even read
 * "admin only in production"), then wrote raw client-supplied homeScore /
 * awayScore / status straight into the games table.
 *
 * Because a game's final score is what settles every pool containing it, any
 * registered user could set an arbitrary score and decide who took the pot.
 * The database did not stop it either — the initial migration shipped:
 *
 *   create policy "Authenticated users can update games" on public.games
 *       for update using (auth.uid() is not null);
 *
 * so RLS explicitly permitted the write. Both layers are fixed: this route now
 * requires the admin role, and migration 20260804000000 replaces that policy
 * with an admin-only one. Scores are validated as non-negative integers and the
 * status against the GameStatus enum.
 */

const outcomeSchema = z
  .object({
    homeScore: z.number().int().min(0).max(200).optional(),
    awayScore: z.number().int().min(0).max(200).optional(),
    status: z.nativeEnum(GameStatus).optional(),
  })
  .refine(
    (v) =>
      v.homeScore !== undefined ||
      v.awayScore !== undefined ||
      v.status !== undefined,
    { message: "Provide at least one of homeScore, awayScore or status" }
  );

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:mutate", RATE_LIMITS.adminMutate);
    if (limited) return limited;

    const { gameId } = await params;
    const supabase = await createClient();

    const auth = await requireAdmin(supabase);
    if (auth instanceof NextResponse) return auth;

    const parsed = outcomeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Validation error" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.homeScore !== undefined)
      updateData.home_score = parsed.data.homeScore;
    if (parsed.data.awayScore !== undefined)
      updateData.away_score = parsed.data.awayScore;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

    const { data, error } = await supabase
      .from("games")
      .update(updateData)
      .eq("id", gameId)
      .select()
      .single();

    if (error) {
      console.error("[games/outcome]", error.message);
      return NextResponse.json({ error: "Failed to update game" }, { status: 400 });
    }

    console.info(
      `[games/outcome] game ${gameId} updated by admin ${auth.user.id}:`,
      JSON.stringify(updateData)
    );

    return NextResponse.json({ game: data }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
