import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNflScoreboard } from "@/lib/fetch-nfl-scoreboard";
import { completePoolIfAllGamesFinished } from "@/lib/pool-completion";
import { materializePoolWinners } from "@/lib/materialize-winners";
import { getPoolFinancials } from "@/lib/pool-financials";
import { isGameDisrupted } from "@/lib/winners";
import { GameStatus, PoolStatus } from "@/lib/enums";
import type { ESPNGame } from "@/lib/types";

/*
 * Pool settlement — the job that turns finished games into paid winners.
 *
 * Runs on a schedule (see vercel.json -> /api/cron/settle). Three phases, in
 * order, because each depends on the previous:
 *
 *   1. refreshGameScores()  pull final scores from ESPN into public.games
 *   2. completePoolIfAllGamesFinished()  flip pools whose slate is done
 *   3. materializePoolWinners()  score cards, pick winners, credit balances
 *
 * DESIGN CONSTRAINTS
 *
 * Idempotent. This runs every 15 minutes and may be retried, so every phase
 * must be safe to repeat. Phase 3 is guarded by a pre-check on
 * user_transactions plus the UNIQUE index idx_user_transactions_winning_per_pool,
 * so a duplicate run cannot credit a balance twice.
 *
 * Non-blocking per pool. One malformed pool must never stop the rest of the
 * slate from settling — every pool is processed in its own try/catch and its
 * failure is reported, not thrown.
 *
 * Order matters. Phase 2 must not run before phase 1, or pools settle against
 * stale scores. Phase 3 must not run before phase 2, because computePoolWinners
 * scores against *finished games only* — invoked on a partial slate it would
 * crown whoever leads after the early window and pay out the whole pot. The
 * pool-completed gate is what makes the slate whole.
 */

export type PoolSettlementOutcome = {
  poolId: string;
  poolName: string | null;
  completed: boolean;
  winnersCreated: number;
  error?: string;
};

export type SettlementReport = {
  ranAt: string;
  gamesChecked: number;
  gamesUpdated: number;
  poolsExamined: number;
  poolsCompleted: number;
  poolsPaid: number;
  winnersCreated: number;
  pools: PoolSettlementOutcome[];
  warnings: string[];
};

/** ESPN competition status -> our games.status. Mirrors /api/sync/nfl-games. */
function mapEspnStatus(competition: ESPNGame["competitions"][0]): string {
  const status = competition.status?.type;
  if (!status) return GameStatus.SCHEDULED;
  if (status.completed) return GameStatus.FINISHED;
  const desc = status.description ?? "";
  if (desc === "In Progress" || desc.includes("Q")) return GameStatus.LIVE;
  return GameStatus.SCHEDULED;
}

function parseScore(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Phase 1 — pull current status and scores from ESPN into public.games.
 *
 * Only touches games that are not already finished: a finished game's score is
 * settled history, and rewriting it after payout would silently change who
 * should have won. Games are keyed by ESPN's competition id, which is exactly
 * what games.id stores.
 */
export async function refreshGameScores(
  admin: SupabaseClient
): Promise<{ checked: number; updated: number; warnings: string[] }> {
  const warnings: string[] = [];

  const { data: pending, error } = await admin
    .from("games")
    .select("id, season, status, home_score, away_score")
    .neq("status", GameStatus.FINISHED);

  if (error) {
    warnings.push(`games query failed: ${error.message}`);
    return { checked: 0, updated: 0, warnings };
  }
  if (!pending?.length) return { checked: 0, updated: 0, warnings };

  // Fetch once per distinct season rather than once per game.
  const seasons = Array.from(
    new Set(pending.map((g) => g.season).filter((s): s is number => s != null))
  );
  if (seasons.length === 0) seasons.push(new Date().getFullYear());

  const espnById = new Map<
    string,
    { status: string; home: number | null; away: number | null }
  >();

  for (const season of seasons) {
    try {
      const board = await getNflScoreboard(season);
      for (const event of board.events ?? []) {
        const competition = event.competitions?.[0];
        if (!competition) continue;
        const home = competition.competitors?.find((c) => c.homeAway === "home");
        const away = competition.competitors?.find((c) => c.homeAway === "away");
        espnById.set(competition.id, {
          status: mapEspnStatus(competition),
          home: parseScore(home?.score),
          away: parseScore(away?.score),
        });
      }
    } catch (e) {
      // A feed outage must not take the whole job down — pools simply do not
      // settle this cycle and the next run picks them up.
      warnings.push(
        `ESPN fetch failed for season ${season}: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }

  let updated = 0;
  for (const game of pending) {
    const live = espnById.get(game.id);
    if (!live) continue;

    const changed =
      live.status !== game.status ||
      live.home !== game.home_score ||
      live.away !== game.away_score;
    if (!changed) continue;

    // Never write a finished status without both scores — computePoolWinners
    // treats a finished game with null scores as an incorrect pick for
    // everyone, which would settle the pool wrongly rather than wait.
    if (
      live.status === GameStatus.FINISHED &&
      (live.home === null || live.away === null)
    ) {
      warnings.push(`game ${game.id} reported finished with no score; skipped`);
      continue;
    }

    const { error: upErr } = await admin
      .from("games")
      .update({
        status: live.status,
        home_score: live.home,
        away_score: live.away,
        updated_at: new Date().toISOString(),
      })
      .eq("id", game.id);

    if (upErr) warnings.push(`game ${game.id} update failed: ${upErr.message}`);
    else updated++;
  }

  return { checked: pending.length, updated, warnings };
}

/**
 * Phases 2 and 3 — complete every pool whose slate is done, then pay it.
 *
 * A pool is only paid in the same tick that completes it, or in a later tick if
 * it was completed but never materialised (a crash between the two writes).
 * That second case is why this re-checks completed pools for missing winners
 * instead of only looking at open ones.
 */
export async function settleReadyPools(
  admin: SupabaseClient
): Promise<{
  outcomes: PoolSettlementOutcome[];
  examined: number;
  warnings: string[];
}> {
  const warnings: string[] = [];

  const { data: pools, error } = await admin
    .from("pools")
    .select("id, name, status")
    .in("status", [PoolStatus.OPEN, PoolStatus.ACTIVE, PoolStatus.COMPLETED]);

  if (error) {
    warnings.push(`pools query failed: ${error.message}`);
    return { outcomes: [], examined: 0, warnings };
  }
  if (!pools?.length) return { outcomes: [], examined: 0, warnings };

  const outcomes: PoolSettlementOutcome[] = [];

  for (const pool of pools) {
    try {
      let completed = pool.status === PoolStatus.COMPLETED;

      if (!completed) {
        completed = await completePoolIfAllGamesFinished(admin, pool.id);
        if (!completed) continue; // slate still running — nothing to do
      } else {
        // Already completed. Only revisit it if it has no winners yet, so a
        // normal run does not repeatedly re-materialise settled pools.
        const { count } = await admin
          .from("pool_winners")
          .select("id", { count: "exact", head: true })
          .eq("pool_id", pool.id);
        if ((count ?? 0) > 0) continue;
      }

      /*
       * Refuse to settle on a zero pot.
       *
       * getPoolFinancials() swallows RPC errors and returns prize_pot: 0. If
       * that happened here, computePoolWinners would derive netPot = 0 and
       * hand back winners with amount 0; materializePoolWinners would insert
       * those winner rows but skip the balance credit (`if (!(amount > 0))
       * continue`). The pool would then look settled — winners on record — and
       * the "already has winners" check above would never revisit it. Players
       * would be paid nothing, permanently, with no error anywhere.
       *
       * A pool with sold cards and a zero pot is therefore always a fault, not
       * an outcome. Leave it unsettled and shout, so the next run can pay it
       * once the underlying problem is fixed.
       */
      const { count: cardCount } = await admin
        .from("parlay_cards")
        .select("id", { count: "exact", head: true })
        .eq("pool_id", pool.id)
        .in("status", ["active", "completed"]);

      const financials = await getPoolFinancials(admin, pool.id);
      if ((cardCount ?? 0) > 0 && !(financials.prize_pot > 0)) {
        warnings.push(
          `pool ${pool.id} has ${cardCount} paid card(s) but a prize pot of ` +
            `${financials.prize_pot} — refusing to settle at zero. Check ` +
            `get_pool_financials and the pool's transactions.`
        );
        outcomes.push({
          poolId: pool.id,
          poolName: pool.name ?? null,
          completed: true,
          winnersCreated: 0,
          error: "zero prize pot with paid cards; settlement skipped",
        });
        continue;
      }

      const { count: created } = await materializePoolWinners(admin, pool.id);

      if (created === 0) {
        // Real and worth surfacing: a completed pool that produced no winner
        // holds entry money with nobody to pay. computePoolWinners returns
        // empty when no card got a single pick right, or when no card covered
        // every finished game.
        warnings.push(
          `pool ${pool.id} completed but produced no winners — funds held, needs review`
        );
      }

      outcomes.push({
        poolId: pool.id,
        poolName: pool.name ?? null,
        completed: true,
        winnersCreated: created,
      });
    } catch (e) {
      outcomes.push({
        poolId: pool.id,
        poolName: pool.name ?? null,
        completed: false,
        winnersCreated: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { outcomes, examined: pools.length, warnings };
}

/** Entry point used by the cron route. */
export async function runSettlement(): Promise<SettlementReport> {
  const admin = createAdminClient();
  const ranAt = new Date().toISOString();

  const scores = await refreshGameScores(admin);
  const settled = await settleReadyPools(admin);

  const winnersCreated = settled.outcomes.reduce(
    (sum, o) => sum + o.winnersCreated,
    0
  );

  return {
    ranAt,
    gamesChecked: scores.checked,
    gamesUpdated: scores.updated,
    poolsExamined: settled.examined,
    poolsCompleted: settled.outcomes.filter((o) => o.completed).length,
    poolsPaid: settled.outcomes.filter((o) => o.winnersCreated > 0).length,
    winnersCreated,
    pools: settled.outcomes,
    warnings: [...scores.warnings, ...settled.warnings],
  };
}

export { isGameDisrupted };
