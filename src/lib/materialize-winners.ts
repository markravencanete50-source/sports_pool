import type { SupabaseClient } from "@supabase/supabase-js";
import { getPoolFinancials } from "@/lib/pool-financials";
import { computePoolWinners } from "@/lib/winners";
import { createAdminClient } from "@/lib/supabase/admin";

export async function materializePoolWinners(
  supabase: SupabaseClient,
  poolId: string,
  options: { force?: boolean } = {}
): Promise<{ count: number }> {
  const admin = createAdminClient();

  /*
   * Settlement is one-shot. Credits are keyed per user+pool, not per winner
   * set, so recomputing after scores change credits the new winner while the
   * old one keeps theirs — the pot pays twice. Once winner rows exist the
   * pool stays settled; `force` is the deliberate admin correction path.
   */
  if (!options.force) {
    const { count: existing, error: existingError } = await admin
      .from("pool_winners")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", poolId);
    if (existingError) {
      console.error("materializePoolWinners pool_winners count:", existingError);
      return { count: 0 };
    }
    if ((existing ?? 0) > 0) return { count: existing ?? 0 };
  }

  const { data: pool } = await admin
    .from("pools")
    .select("id, name")
    .eq("id", poolId)
    .single();

  if (!pool) return { count: 0 };

  const { data: poolCards } = await admin
    .from("parlay_cards")
    .select("id, user_id")
    .eq("pool_id", poolId)
    .in("status", ["active", "completed"]);

  if (!poolCards?.length) return { count: 0 };

  const cardIds = poolCards.map((c) => c.id);

  const { data: picks } = await admin
    .from("card_picks")
    .select("card_id, game_id, prediction, total_score_prediction")
    .in("card_id", cardIds);

  const { data: poolGames } = await admin
    .from("pool_games")
    .select(`
      game_id,
      games!pool_games_game_id_fkey(id, status, home_score, away_score)
    `)
    .eq("pool_id", poolId);

  if (!picks?.length || !poolGames?.length) return { count: 0 };

  const { data: platformSettings } = await admin
    .from("platform_settings")
    .select("platform_fee_percentage")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  const platformFeePct = platformSettings?.platform_fee_percentage ?? 10;
  const financials = await getPoolFinancials(admin, poolId);
  const prizePot = financials.prize_pot;

  /*
   * A pool with sold cards and a zero pot is a fault, not an outcome: settling
   * it would record 0-amount winners, skip every credit, and look settled
   * forever. Leave it unsettled so a later run can pay it once fixed.
   */
  if (!(prizePot > 0)) {
    console.error(
      `materializePoolWinners: pool ${poolId} has ${poolCards.length} paid ` +
        `card(s) but a prize pot of ${prizePot}; refusing to settle at zero`
    );
    return { count: 0 };
  }

  const winners = computePoolWinners({
    pool: { id: pool.id, name: pool.name, prize_pot: prizePot },
    poolCards,
    picks,
    poolGames,
    platformFeePercentage: platformFeePct,
  });

  if (winners.length === 0) return { count: 0 };

  if (options.force) {
    await admin.from("pool_winners").delete().eq("pool_id", poolId);
  }

  const rows = winners.map((winner) => ({
    pool_id: poolId,
    user_id: winner.userId,
    winning_card_id: winner.cardId,
    correct: winner.correct,
    total: winner.total,
    amount: winner.amount,
    total_score_diff: winner.totalScoreDiff,
  }));

  const { error } = await admin.from("pool_winners").insert(rows);

  if (error) {
    console.error("materializePoolWinners insert error:", error);
    return { count: 0 };
  }

  const now = new Date().toISOString();
  const winnerIds = winners.map((winner) => winner.userId);
  const { error: updateError } = await admin
    .from("pool_winners")
    .update({ approved_at: now, approved_by: null })
    .eq("pool_id", poolId)
    .in("user_id", winnerIds);
  if (updateError) {
    console.error("materializePoolWinners pool_winners update:", updateError);
  }

  for (const winner of winners) {
    const amount = Number(winner.amount);
    if (!(amount > 0)) continue;

    const { data: alreadyCredited } = await admin
      .from("user_transactions")
      .select("id")
      .eq("user_id", winner.userId)
      .eq("pool_id", poolId)
      .eq("type", "winning_approved")
      .maybeSingle();
    if (alreadyCredited) continue;

    const { data: payoutApproval, error: insertApprovalError } = await admin
      .from("payout_approvals")
      .insert({
        user_id: winner.userId,
        pool_id: poolId,
        amount: winner.amount,
        approved_by: null,
        approved_at: now,
        status: "pending_claim",
      })
      .select("id")
      .single();
    if (insertApprovalError || !payoutApproval) {
      if (insertApprovalError?.code === "23505") continue;
      console.error("materializePoolWinners payout_approvals insert:", insertApprovalError);
      continue;
    }

    /*
     * Atomic credit: a read-then-write here raced with any concurrent balance
     * change (a claim on another pool, an approved payout) and clobbered it
     * with a stale absolute value. The ledger row is derived from the RPC's
     * returned balance so final = previous + amount holds against what was
     * actually written.
     */
    const { data: creditedBalance, error: creditError } = await admin.rpc(
      "credit_user_balance",
      { p_user_id: winner.userId, p_amount: amount }
    );
    if (
      creditError ||
      creditedBalance === null ||
      creditedBalance === undefined
    ) {
      console.error(
        "materializePoolWinners credit_user_balance:",
        creditError?.message ?? "no user row"
      );
      continue;
    }

    const finalBalance = Number(creditedBalance);
    const previousBalance = finalBalance - amount;

    const { error: insertTxError } = await admin.from("user_transactions").insert({
      user_id: winner.userId,
      admin_id: null,
      previous_balance: previousBalance,
      amount,
      final_balance: finalBalance,
      type: "winning_approved",
      reference_type: "payout_approval",
      reference_id: payoutApproval.id,
      pool_id: poolId,
      comment: null,
    });
    if (insertTxError) {
      // Without a ledger row the credit must not stand — on the 23505 from
      // idx_user_transactions_winning_per_pool a concurrent run has already
      // credited this winning, so back this one out.
      const { error: undoError } = await admin.rpc("debit_user_balance", {
        p_user_id: winner.userId,
        p_amount: amount,
      });
      if (undoError) {
        console.error(
          `materializePoolWinners CRITICAL: credited ${amount} to user ` +
            `${winner.userId} but the ledger insert failed AND the ` +
            `compensating debit failed (${undoError.message}). MANUAL CORRECTION REQUIRED.`
        );
      }
      if (insertTxError.code !== "23505") {
        console.error("materializePoolWinners user_transactions insert:", insertTxError);
      }
      continue;
    }

    await admin
      .from("payout_approvals")
      .update({ status: "claimed", claimed_at: now })
      .eq("id", payoutApproval.id);
  }

  return { count: rows.length };
}
