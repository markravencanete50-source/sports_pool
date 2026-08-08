import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const poolId = body.poolId;
    if (!poolId || typeof poolId !== "string") {
      return NextResponse.json(
        { error: "poolId is required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: poolWinner, error: poolWinnerError } = await admin
      .from("pool_winners")
      .select("id, user_id, pool_id, amount, approved_at")
      .eq("pool_id", poolId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (poolWinnerError || !poolWinner) {
      return NextResponse.json(
        { error: "You are not the winner for this pool" },
        { status: 403 }
      );
    }
    if (!poolWinner.approved_at) {
      return NextResponse.json(
        { error: "This winning has not been approved yet" },
        { status: 400 }
      );
    }

    const { data: approval, error: approvalError } = await admin
      .from("payout_approvals")
      .select("id, user_id, pool_id, amount, status, comment, approved_by")
      .eq("user_id", user.id)
      .eq("pool_id", poolId)
      .maybeSingle();

    if (approvalError || !approval) {
      return NextResponse.json(
        { error: "Payout approval not found" },
        { status: 404 }
      );
    }
    if (approval.status !== "pending_claim") {
      return NextResponse.json(
        { error: "This payout has already been claimed" },
        { status: 400 }
      );
    }

    const { data: alreadyCredited } = await admin
      .from("user_transactions")
      .select("id")
      .eq("user_id", user.id)
      .eq("pool_id", poolId)
      .eq("type", "winning_approved")
      .maybeSingle();

    if (alreadyCredited) {
      const { data: account } = await admin
        .from("users")
        .select("balance")
        .eq("id", user.id)
        .single();
      const currentBalance = Number(account?.balance ?? 0);
      return NextResponse.json(
        {
          message: "Payout already credited to your balance",
          previousBalance: currentBalance,
          amount: 0,
          finalBalance: currentBalance,
        },
        { status: 200 }
      );
    }

    const amount = Number(approval.amount);
    if (!(amount > 0)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
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
      { p_user_id: user.id, p_amount: amount }
    );

    if (creditError) {
      console.error("[claim-payout] credit failed:", creditError.message);
      return NextResponse.json(
        { error: "Could not credit your balance" },
        { status: 500 }
      );
    }
    // NULL means the UPDATE matched no row: no such user.
    if (creditedBalance === null || creditedBalance === undefined) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const balanceAfter = Number(creditedBalance);
    const balanceBefore = balanceAfter - amount;

    const { error: insertTxError } = await admin.from("user_transactions").insert({
      user_id: user.id,
      admin_id: approval.approved_by ?? null,
      previous_balance: balanceBefore,
      amount,
      final_balance: balanceAfter,
      type: "winning_approved",
      reference_type: "payout_approval",
      reference_id: approval.id,
      pool_id: poolId,
      comment: approval.comment ?? null,
    });

    if (insertTxError) {
      // Without a ledger row the credit must not stand — on the 23505 from
      // idx_user_transactions_winning_per_pool a concurrent claim already
      // credited this winning, so back this one out.
      const { error: undoError } = await admin.rpc("debit_user_balance", {
        p_user_id: user.id,
        p_amount: amount,
      });
      if (undoError) {
        console.error(
          `[claim-payout] CRITICAL: credited ${amount} to user ${user.id} ` +
            `but the ledger insert failed AND the compensating debit failed ` +
            `(${undoError.message}). MANUAL CORRECTION REQUIRED.`
        );
      }

      if (insertTxError.code === "23505") {
        const { data: refreshed } = await admin
          .from("users")
          .select("balance")
          .eq("id", user.id)
          .single();
        const currentBalance = Number(refreshed?.balance ?? 0);
        return NextResponse.json(
          {
            message: "Payout already credited to your balance",
            previousBalance: currentBalance,
            amount: 0,
            finalBalance: currentBalance,
          },
          { status: 200 }
        );
      }

      return NextResponse.json({ error: insertTxError.message }, { status: 400 });
    }

    const { error: markClaimedError } = await admin
      .from("payout_approvals")
      .update({ status: "claimed", claimed_at: new Date().toISOString() })
      .eq("id", approval.id);

    if (markClaimedError) {
      return NextResponse.json({ error: markClaimedError.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        message: "Payout claimed and credited to your balance",
        previousBalance: balanceBefore,
        amount,
        finalBalance: balanceAfter,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
