import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { recordAdminAction } from "@/lib/compliance/audit";
import { getPayoutProvider } from "@/lib/payouts";
import { assertSameOrigin } from "@/lib/request-guards";
import { completePayoutSchema, uuidParamSchema } from "@/lib/validations";
import { recordAppError, logEvent } from "@/lib/log";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Send a withdrawal — the step that moves money.
 *
 * Provider-agnostic: the user's saved payout method selects a provider from
 * the registry (src/lib/payouts). An API provider (PayPal) sends and returns
 * a reference; a MANUAL provider (Revolut, bank transfer) returns
 * instructions and the request is parked as `processing` for the operator to
 * finish via /api/admin/withdrawals/[id] complete_manual — the balance is
 * debited only when the money actually goes.
 *
 * A request must be `approved` (reviewed) or `pending` (legacy one-step
 * approval) to be sent.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "payout:complete", RATE_LIMITS.payoutComplete);
    if (limited) return limited;

    const { id: payoutRequestId } = await params;
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { requireMfa: true, permission: "withdrawals.approve" });
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    if (!uuidParamSchema.safeParse(payoutRequestId).success) {
      return NextResponse.json({ error: "Invalid payout request id" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = completePayoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
        { status: 400 }
      );
    }
    const comment = parsed.data.comment || null;

    const admin = createAdminClient();

    const { data: payoutRequest, error: prError } = await admin
      .from("payout_requests")
      .select("id, user_id, amount, status, provider")
      .eq("id", payoutRequestId)
      .maybeSingle();

    if (prError || !payoutRequest) {
      return NextResponse.json({ error: "Payout request not found" }, { status: 404 });
    }
    if (payoutRequest.status !== "pending" && payoutRequest.status !== "approved") {
      return NextResponse.json(
        { error: `Payout request is ${payoutRequest.status}, not awaiting send` },
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
      return NextResponse.json({ error: "Invalid payout amount" }, { status: 400 });
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
            "User has not linked a payout account. They must add one in My Games before you can approve.",
          code: "PAYOUT_ACCOUNT_REQUIRED",
        },
        { status: 400 }
      );
    }

    const provider = getPayoutProvider(payoutAccount.method);
    if (!provider) {
      return NextResponse.json(
        { error: `Unsupported payout method "${payoutAccount.method}"`, code: "UNSUPPORTED_METHOD" },
        { status: 400 }
      );
    }
    const identifier = String(payoutAccount.identifier ?? "").trim();
    const identifierProblem = provider.validateIdentifier(identifier);
    if (identifierProblem) {
      return NextResponse.json({ error: `User payout account: ${identifierProblem}` }, { status: 400 });
    }
    if (!provider.isConfigured()) {
      return NextResponse.json(
        { error: provider.configurationProblem() ?? `${provider.label} is not configured` },
        { status: 503 }
      );
    }

    /*
     * ATOMIC CLAIM — flip to processing in one conditional UPDATE before any
     * money moves.
     *
     * Two admins (or one double-clicked button) can both see the request as
     * sendable and both fall through to the debit. The atomic debit stops an
     * OVERDRAFT, but not a double SEND — with a balance >= 2x the amount both
     * debits succeed, and the only thing then between that and paying twice is
     * the provider happening to reject the duplicate batch id. Claim the row
     * first: exactly one UPDATE matches the sendable status, so the loser
     * matches no row and returns here having moved nothing.
     */
    const previousStatus = payoutRequest.status as string;
    const { data: claimed, error: claimError } = await admin
      .from("payout_requests")
      .update({ status: "processing", provider: provider.method })
      .eq("id", payoutRequestId)
      .eq("status", previousStatus)
      .select("id")
      .maybeSingle();
    if (claimError) {
      console.error("[payout-complete] claim failed:", claimError.message);
      return NextResponse.json({ error: "Could not start processing this payout" }, { status: 500 });
    }
    if (!claimed) {
      return NextResponse.json({ error: "Payout request is already being processed" }, { status: 409 });
    }

    // Undo the claim so the request is retryable when we stop BEFORE any money
    // has moved (a failed debit reservation). Never call this once the
    // provider has been asked to send.
    const releaseClaim = async () => {
      const { error: releaseError } = await admin
        .from("payout_requests")
        .update({ status: previousStatus })
        .eq("id", payoutRequestId)
        .eq("status", "processing");
      if (releaseError) {
        console.error(
          `[payout-complete] failed to release claim on ${payoutRequestId} back to ${previousStatus}: ${releaseError.message}`
        );
      }
    };

    /*
     * MANUAL RAIL. Nothing is sent by the platform: hand the operator the
     * instruction and leave the request `processing`. The balance is debited
     * when they confirm the transfer (complete_manual), not before.
     */
    const preview = await provider.send({
      payoutRequestId,
      userId: payoutRequest.user_id,
      amount,
      currency: "USD",
      identifier,
      note: comment ?? "Payout from Gridiron",
    }).catch(async (err: unknown) => {
      // For an API provider this is the real send; handle below. For a manual
      // provider `send` never throws.
      throw err;
    }).then(async (result) => {
      if (result.kind === "manual") {
        await recordAdminAction({
          actorId: user.id,
          action: "payout.manual_started",
          targetType: "payout_request",
          targetId: payoutRequestId,
          after: { amount, provider: provider.method, recipient: payoutRequest.user_id },
          reason: comment,
        });
        return NextResponse.json(
          {
            manual: true,
            message: result.instructions,
            next: "Send the funds, then use 'Mark completed' with the transfer reference.",
          },
          { status: 202 }
        );
      }
      return result;
    }).catch(async (err: unknown) => {
      const message = err instanceof Error ? err.message : `${provider.label} payout failed`;
      await releaseClaim();
      return NextResponse.json({ error: `Could not send via ${provider.label}: ${message}` }, { status: 502 });
    });

    if (preview instanceof NextResponse) return preview;

    /*
     * API RAIL — the money is ALREADY sent at this point (PayPal sends inside
     * provider.send). What follows mirrors the original ordering: debit the
     * reservation, mark completed FIRST so a retry cannot re-send, then the
     * audit rows best-effort.
     *
     * NOTE: reserve-then-send is the safer order for a rail that can fail
     * after debit; PayPal's adapter sends synchronously, so the debit happens
     * here and, if the debit somehow fails after a successful send, it is
     * logged as a CRITICAL reconciliation item rather than hidden.
     */
    const providerReference = preview.providerReference;
    const { data: debitedBalance, error: debitError } = await admin.rpc("debit_user_balance", {
      p_user_id: payoutRequest.user_id,
      p_amount: amount,
    });
    if (debitError || debitedBalance === null || debitedBalance === undefined) {
      console.error(
        `[payout-complete] CRITICAL: ${provider.label} ${providerReference} sent ${amount} for user ${payoutRequest.user_id} ` +
          `but the balance debit ${debitError ? `failed (${debitError.message})` : "found insufficient funds"}. MANUAL CORRECTION REQUIRED.`
      );
      await recordAppError({
        source: "server",
        message:
          `CRITICAL payout state: ${provider.label} ${providerReference} sent ${amount} for user ${payoutRequest.user_id}, ` +
          `balance debit ${debitError ? `failed (${debitError.message})` : "insufficient"}. Manual correction required.`,
        digest: payoutRequestId,
        url: "/api/admin/payout-requests/complete",
      });
    }

    const finalBalance = Number(debitedBalance ?? 0);
    const previousBalance = finalBalance + amount;
    const debitAmount = -amount;

    const { error: updateError } = await admin
      .from("payout_requests")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        processed_by: user.id,
        stripe_transfer_id: providerReference,
        provider_reference: providerReference,
      })
      .eq("id", payoutRequestId);

    if (updateError) {
      console.error(
        `[payout-complete] CRITICAL: ${provider.label} ${providerReference} sent and balance ` +
          `debited for request ${payoutRequestId}, but status update failed ` +
          `(${updateError.message}). MANUAL RECONCILIATION REQUIRED.`
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
      console.error(
        `[payout-complete] CRITICAL: ${provider.label} ${providerReference} sent for request ` +
          `${payoutRequestId} but the audit user_transactions insert failed ` +
          `(${txError.message}). Balance was debited; audit row missing. ` +
          `MANUAL RECONCILIATION REQUIRED.`
      );
    }

    logEvent("info", "payout.completed", { payoutRequestId, provider: provider.method, amount });

    await recordAdminAction({
      actorId: user.id,
      action: "payout.completed",
      targetType: "payout_request",
      targetId: payoutRequestId,
      after: {
        amount,
        provider: provider.method,
        providerReference,
        recipient: payoutRequest.user_id,
        finalBalance,
      },
      reason: comment,
    });

    return NextResponse.json(
      {
        message: `Payout sent via ${provider.label} and balance updated`,
        previousBalance,
        amount: debitAmount,
        finalBalance,
        providerReference,
        // Kept for the existing UI.
        paypalBatchId: provider.method === "paypal" ? providerReference : undefined,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
