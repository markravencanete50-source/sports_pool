import type { SupabaseClient } from "@supabase/supabase-js";
import { getPoolFinancials } from "@/lib/pool-financials";
import { computePoolWinners } from "@/lib/winners";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Score a completed pool and pay its winners.
 *
 * NOTE the `supabase` parameter is intentionally unused: this function always
 * builds its own service-role client, because it writes balances. It is kept so
 * existing call sites compile, but do NOT read it as "runs with the caller's
 * rights" — it never did, and that mismatch is what made the re-settlement bug
 * below invisible at the call site.
 */
export async function materializePoolWinners(
  _supabase: SupabaseClient,
  poolId: string
): Promise<{ count: number }> {
  const admin = createAdminClient();

  const { data: pool } = await admin
    .from("pools")
    .select("id, name, platform_fee_percentage")
    .eq("id", poolId)
    .single();

  if (!pool) return { count: 0 };

  /*
   * CRITICAL — settle a pool ONCE, and never again.
   *
   * Below, this function does `delete from pool_winners where pool_id = ...`
   * and rewrites the winner set. It does NOT reverse money already paid: the
   * user_transactions rows, payout_approvals and users.balance from the previous
   * run all stand. Re-running it after a payout therefore pays the pot a second
   * time, to a possibly different winner.
   *
   * That was reachable by an ordinary player. RLS lets a card leave 'pending'
   * with no pool-status condition, and /api/me/winnings re-materialised any
   * completed pool in which the caller had no winner row. So: buy a card, fill
   * in every pick, DO NOT lock it, wait for the results, then flip the card to
   * 'active' straight through PostgREST and load the winnings page. The card is
   * now scored with the outcomes known, the real winner's row is deleted, and
   * the attacker is credited — while the original winner keeps their credit.
   *
   * Refuse outright once the pool has winners or has moved money. Re-scoring a
   * settled pool is an operator action against the ledger, not something an
   * HTTP request may trigger.
   */
  const [{ count: existingWinners }, { count: paidCount }] = await Promise.all([
    admin
      .from("pool_winners")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", poolId),
    admin
      .from("user_transactions")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", poolId)
      .eq("type", "winning_approved"),
  ]);

  if ((existingWinners ?? 0) > 0 || (paidCount ?? 0) > 0) {
    console.warn(
      `[materialize-winners] pool ${poolId} is already settled ` +
        `(${existingWinners ?? 0} winner rows, ${paidCount ?? 0} credits). ` +
        `Refusing to re-materialise — that would pay the pot twice.`
    );
    return { count: 0 };
  }

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

  /*
   * FEE LOCK — settle against the fee this pool was CREATED with.
   *
   * This used to read the live platform_settings row, so an admin who changed
   * platform_fee_percentage between the first card sale and settlement re-split
   * an in-flight pot against a rate nobody was charged (10% -> 20% quietly took
   * another 10% off the players). pools.platform_fee_percentage is stamped at
   * insert by trg_set_pool_platform_fee and is immutable for the pool's life.
   *
   * The platform_settings read remains only as a fallback for any legacy row the
   * backfill did not reach.
   */
  let platformFeePct = Number(pool.platform_fee_percentage);

  if (!Number.isFinite(platformFeePct)) {
    const { data: platformSettings } = await admin
      .from("platform_settings")
      .select("platform_fee_percentage")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    platformFeePct = Number(platformSettings?.platform_fee_percentage);
    if (!Number.isFinite(platformFeePct)) platformFeePct = 10;
  }

  // Clamp before it is multiplied into the payout. computePoolWinners derives
  // netPot = prize_pot * (1 - pct/100), so a negative percentage would pay out
  // MORE than the pot — minting money — and one above 100 would go negative.
  // The database constrains this column too; this is the second line of defence.
  platformFeePct = Math.min(Math.max(platformFeePct, 0), 100);
  const financials = await getPoolFinancials(admin, poolId);
  const prizePot = financials.prize_pot ?? 0;

  const winners = computePoolWinners({
    pool: { id: pool.id, name: pool.name, prize_pot: prizePot },
    poolCards,
    picks,
    poolGames,
    platformFeePercentage: platformFeePct,
  });

  if (winners.length === 0) return { count: 0 };

  await admin.from("pool_winners").delete().eq("pool_id", poolId);

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

    const { data: account, error: fetchAccountError } = await admin
      .from("users")
      .select("balance")
      .eq("id", winner.userId)
      .single();
    if (fetchAccountError || !account) continue;

    const balanceBefore = Number(account.balance ?? 0);
    const balanceAfter = balanceBefore + amount;

    const { error: insertTxError } = await admin.from("user_transactions").insert({
      user_id: winner.userId,
      admin_id: null,
      previous_balance: balanceBefore,
      amount,
      final_balance: balanceAfter,
      type: "winning_approved",
      reference_type: "payout_approval",
      reference_id: payoutApproval.id,
      pool_id: poolId,
      comment: null,
    });
    if (insertTxError) {
      console.error("materializePoolWinners user_transactions insert:", insertTxError);
      continue;
    }

    // Move the balance with an ATOMIC relative increment, not an absolute
    // write. The transaction row is inserted first (guarded by the unique
    // winning-per-pool index), so a concurrent balance change — e.g. a user
    // claiming a different payout in this same window — is preserved rather
    // than clobbered by writing back a value computed from an earlier read.
    // This matches the atomic money paths used by claim_pool_payout and the
    // admin payout route.
    const { error: updateBalanceError } = await admin.rpc("credit_user_balance", {
      p_user_id: winner.userId,
      p_amount: amount,
    });
    if (updateBalanceError) {
      console.error("materializePoolWinners users balance update:", updateBalanceError);
      continue;
    }

    await admin
      .from("payout_approvals")
      .update({ status: "claimed", claimed_at: now })
      .eq("id", payoutApproval.id);
  }

  return { count: rows.length };
}
