import { SupabaseClient } from "@supabase/supabase-js";
import { GameStatus, PoolStatus } from "@/lib/enums";
import { isGameDisrupted } from "@/lib/winners";
import { createAdminClient } from "@/lib/supabase/admin";

/** A game is "done" for pool completion if it's finished or disrupted (canceled/postponed). */
function isGameDone(status: string): boolean {
  return status === GameStatus.FINISHED || isGameDisrupted(status);
}

export async function completePoolIfAllGamesFinished(
  supabase: SupabaseClient,
  poolId: string
): Promise<boolean> {
  const { data: pool, error: poolError } = await supabase
    .from("pools")
    .select("id, status")
    .eq("id", poolId)
    .single();

  if (poolError || !pool) return false;

  const isOpenOrActive =
    pool.status === PoolStatus.OPEN || pool.status === PoolStatus.ACTIVE;
  if (!isOpenOrActive) return false;

  const { data: poolGames } = await supabase
    .from("pool_games")
    .select("game_id")
    .eq("pool_id", poolId);

  const gameIds =
    poolGames?.map((pg: { game_id: string }) => pg.game_id).filter(Boolean) ??
    [];
  if (gameIds.length === 0) return false;

  const { data: games } = await supabase
    .from("games")
    .select("id, status")
    .in("id", gameIds);

  const allDone =
    Array.isArray(games) &&
    games.length === gameIds.length &&
    games.every((g: { status: string }) => isGameDone(g.status));

  if (!allDone) return false;

  const admin = createAdminClient();
  const { error: updateErr } = await admin
    .from("pools")
    .update({
      status: PoolStatus.COMPLETED,
      updated_at: new Date().toISOString(),
    })
    .eq("id", poolId);

  return !updateErr;
}
