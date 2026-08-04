import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createPayPalPayout, isPayPalConfigured } from "@/lib/paypal";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: payoutRequestId } = await params;
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    const body = await request.json().catch(() => ({}));
    const comment =
      typeof body.comment === "string" ? body.comment.trim() || null : null;

    const admin = createAdminClient();

    const { data: payoutRequest, error: prError } = await admin
      .from("payout_requests")
      .select("id, user_id, amount, status")
      .eq("id", payoutRequestId)
      .maybeSingle();

    if (prError || !payoutRequest) {
      return NextResponse.json(
        { error: "Payout request not found" },
        { status: 404 }
      );
    }
    if (payoutRequest.status !== "pending") {
      return NextResponse.json(
        { error: "Payout request is not pending" },
        { status: 400 }
      );
    }

    /* Idempotency: do not process same payout request twice */
    const { data: existingTx } = await admin
      .from("user_transactions")
      .select("id")
      .eq("reference_type", "payout_request")
      .eq("reference_id", payoutRequestId)
      .maybeSingle();
    if (existingTx) {
      return NextResponse.json(
        { error: "This payout has already been processed" },
        { status: 400 }
      );
    }

    const amount = Number(payoutRequest.amount);
    if (!(amount > 0)) {
      return NextResponse.json(
        { error: "Invalid payout amount" },
        { status: 400 }
      );
    }

    const { data: payoutAccount, error: accountError } = await admin
      .from("user_payout_accounts")
      .select("method, identifier")
      .eq("user_id", payoutRequest.user_id)
      .maybeSingle();

    if (accountError || !payoutAccount) {
      return NextResponse.json(
        {
          error:
            "User has not linked a payout account. They must add PayPal in My Games before you can approve.",
          code: "PAYOUT_ACCOUNT_REQUIRED",
        },
        { status: 400 }
      );
    }

    if (payoutAccount.method !== "paypal") {
      return NextResponse.json(
        {
          error:
            "Only PayPal payouts are supported. User must link a PayPal email.",
          code: "UNSUPPORTED_METHOD",
        },
        { status: 400 }
      );
    }

    const receiverEmail = payoutAccount.identifier?.trim();
    if (!receiverEmail || !receiverEmail.includes("@")) {
      return NextResponse.json(
        { error: "User payout account has an invalid PayPal email." },
        { status: 400 }
      );
    }

    if (!isPayPalConfigured()) {
      return NextResponse.json(
        {
          error:
            "PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in the server environment.",
        },
        { status: 503 }
      );
    }

    /*
     * SECURITY — ordering is the whole point here.
     *
     * This route used to call PayPal FIRST and check the balance afterwards, so
     * N concurrent approvals each sent real money before any of them verified
     * funds. Balance was never reserved at request time either, so the float
     * could be drained well past what the user actually held.
     *
     * Correct order is reserve -> send -> compensate on failure:
     *   1. Atomically debit (a single UPDATE ... WHERE balance >= amount, via
     *      debit_user_balance). A read-then-write in JS would still be a TOCTOU
     *      race; concurrent callers must serialise on the row lock.
     *   2. Only if the debit succeeded, send the money.
     *   3. If PayPal fails, credit the reservation back.
     */
    const { data: debitedBalance, error: debitError } = await admin.rpc(
      "debit_user_balance",
      { p_user_id: payoutRequest.user_id, p_amount: amount }
    );

    if (debitError) {
      console.error("[payout-complete] debit failed:", debitError.message);
      return NextResponse.json(
        { error: "Could not reserve funds for this payout" },
        { status: 500 }
      );
    }

    // NULL means the conditional UPDATE matched no row: insufficient funds.
    // Nothing has been sent at this point.
    if (debitedBalance === null || debitedBalance === undefined) {
      return NextResponse.json(
        { error: "User balance is insufficient for this payout" },
        { status: 400 }
      );
    }

    const finalBalance = Number(debitedBalance);
    const previousBalance = finalBalance + amount;
    const debitAmount = -amount;

    let batchId: string;
    try {
      const result = await createPayPalPayout({
        receiverEmail,
        amountUsd: amount,
        note: comment ?? "Payout from Gridiron",
        senderBatchId: `gridiron-${payoutRequestId}`,
      });
      batchId = result.batchId;
    } catch (paypalError) {
      const message =
        paypalError instanceof Error
          ? paypalError.message
          : "PayPal payout failed";

      // Compensating action: the money never left, so return the reservation.
      const { error: refundError } = await admin.rpc("credit_user_balance", {
        p_user_id: payoutRequest.user_id,
        p_amount: amount,
      });
      if (refundError) {
        console.error(
          `[payout-complete] CRITICAL: debited ${amount} for user ${payoutRequest.user_id} ` +
            `but PayPal failed AND the refund failed (${refundError.message}). MANUAL CORRECTION REQUIRED.`
        );
      }

      await admin
        .from("payout_requests")
        .update({
          status: "failed",
          processed_at: new Date().toISOString(),
          processed_by: user.id,
        })
        .eq("id", payoutRequestId);
      return NextResponse.json(
        { error: `Could not send to PayPal: ${message}` },
        { status: 502 }
      );
    }

    const { error: txError } = await admin.from("user_transactions").insert({
      user_id: payoutRequest.user_id,
      admin_id: user.id,
      previous_balance: previousBalance,
      amount: debitAmount,
      final_balance: finalBalance,
      type: "payout",
      reference_type: "payout_request",
      reference_id: payoutRequest.id,
      pool_id: null,
      comment,
    });

    if (txError) {
      return NextResponse.json({ error: txError.message }, { status: 400 });
    }

    // NOTE: the balance was already moved atomically by debit_user_balance()
    // above. The absolute `update({ balance: finalBalance })` that used to sit
    // here is deliberately gone — writing a value computed before the PayPal
    // call would clobber any concurrent change (a prize credited in that
    // window would simply vanish). The RPC is the single source of the change.

    const { error: updateError } = await admin
      .from("payout_requests")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        processed_by: user.id,
        stripe_transfer_id: batchId,
      })
      .eq("id", payoutRequestId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        message: "Payout sent to user's PayPal and balance updated",
        previousBalance,
        amount: debitAmount,
        finalBalance,
        paypalBatchId: batchId,
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
