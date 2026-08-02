import type { SupabaseClient } from "@supabase/supabase-js";
import { getPoolFinancials } from "@/lib/pool-financials";
import { computePoolWinners } from "@/lib/winners";
import { createAdminClient } from "@/lib/supabase/admin";

export async function materializePoolWinners(
  supabase: SupabaseClient,
  poolId: string
): Promise<{ count: number }> {
  const admin = createAdminClient();

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

    const { error: updateBalanceError } = await admin
      .from("users")
      .update({ balance: balanceAfter })
      .eq("id", winner.userId);
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
