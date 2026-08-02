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

    const { data: userRow, error: userError } = await admin
      .from("users")
      .select("balance")
      .eq("id", payoutRequest.user_id)
      .single();
    if (userError || !userRow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const previousBalance = Number(userRow.balance ?? 0);
    if (previousBalance < amount) {
      return NextResponse.json(
        { error: "User balance is insufficient for this payout" },
        { status: 400 }
      );
    }

    const debitAmount = -amount;
    const finalBalance = previousBalance + debitAmount;

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

    const { error: balanceError } = await admin
      .from("users")
      .update({ balance: finalBalance })
      .eq("id", payoutRequest.user_id);

    if (balanceError) {
      return NextResponse.json(
        { error: balanceError.message },
        { status: 400 }
      );
    }

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
