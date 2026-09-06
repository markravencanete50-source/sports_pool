import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin, requireReason } from "@/lib/require-admin";
import { recordAdminAction } from "@/lib/compliance/audit";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isUuid, badRequest, notFound } from "@/lib/admin/helpers";
import { z } from "zod";

/**
 * Withdrawal review decisions that do NOT move money:
 *   approve   pending|on_hold → approved   (cleared for sending; the "complete"
 *                                            route then actually sends)
 *   hold      pending|approved → on_hold
 *   reject    pending|approved|on_hold → rejected   (balance is untouched: the
 *                                            debit only happens on send)
 *   cancel    pending|approved|on_hold → cancelled  (operator cancellation)
 *   retry     failed → pending                       (re-queue after a provider
 *                                            failure; the failed send already
 *                                            credited the balance back)
 *   complete_manual  approved|processing → completed (a MANUAL rail — Revolut /
 *                                            bank — was paid outside; records
 *                                            the reference, debits the balance)
 * Everything needs a reason; approve / complete_manual need a second factor.
 */
const bodySchema = z.object({
  action: z.enum(["approve", "hold", "reject", "cancel", "retry", "complete_manual"]),
  reason: z.string().trim().min(5).max(1000),
  reference: z.string().trim().min(3).max(120).optional(),
});

const PERMISSION_FOR = {
  approve: "withdrawals.approve",
  hold: "withdrawals.hold",
  reject: "withdrawals.reject",
  cancel: "withdrawals.reject",
  retry: "withdrawals.retry",
  complete_manual: "withdrawals.approve",
} as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:withdrawal", RATE_LIMITS.adminAction);
    if (limited) return limited;

    const { id } = await params;
    if (!isUuid(id)) return notFound("Withdrawal not found");

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
    const reasonCheck = requireReason(body);
    if (reasonCheck instanceof NextResponse) return reasonCheck;
    const { action, reference } = parsed.data;
    const { reason } = reasonCheck;

    const supabase = await createClient();
    const auth = await requireAdmin(supabase, {
      permission: PERMISSION_FOR[action],
      requireMfa: action === "approve" || action === "complete_manual",
    });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data: wr } = await admin
      .from("payout_requests")
      .select("id, user_id, amount, status, provider, retry_count")
      .eq("id", id)
      .maybeSingle();
    if (!wr) return notFound("Withdrawal not found");

    const from = wr.status as string;
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { review_reason: reason, reviewed_by: auth.user.id, reviewed_at: now };
    let to: string;

    switch (action) {
      case "approve":
        if (!["pending", "on_hold"].includes(from)) return badRequest(`A ${from} withdrawal cannot be approved`);
        to = "approved";
        break;
      case "hold":
        if (!["pending", "approved"].includes(from)) return badRequest(`A ${from} withdrawal cannot be put on hold`);
        to = "on_hold";
        break;
      case "reject":
        if (!["pending", "approved", "on_hold"].includes(from)) return badRequest(`A ${from} withdrawal cannot be rejected`);
        to = "rejected";
        patch.processed_at = now;
        patch.processed_by = auth.user.id;
        break;
      case "cancel":
        if (!["pending", "approved", "on_hold"].includes(from)) return badRequest(`A ${from} withdrawal cannot be cancelled`);
        to = "cancelled";
        patch.processed_at = now;
        patch.processed_by = auth.user.id;
        break;
      case "retry":
        if (from !== "failed") return badRequest("Only a failed withdrawal can be retried");
        to = "pending";
        patch.failure_reason = null;
        patch.retry_count = Number(wr.retry_count ?? 0) + 1;
        break;
      case "complete_manual": {
        if (!["approved", "processing"].includes(from)) return badRequest(`A ${from} withdrawal cannot be completed manually`);
        if (wr.provider === "paypal") return badRequest("PayPal withdrawals are sent through the PayPal route, not marked manually");
        if (!reference) return badRequest("The transfer reference is required");
        // Debit atomically; refuse if the balance no longer covers it.
        const { data: debited, error: debitError } = await admin.rpc("debit_user_balance", {
          p_user_id: wr.user_id,
          p_amount: Number(wr.amount),
        });
        if (debitError) return NextResponse.json({ error: "Could not reserve funds" }, { status: 500 });
        if (debited === null || debited === undefined) return badRequest("User balance is insufficient for this withdrawal");
        const finalBalance = Number(debited);
        await admin.from("user_transactions").insert({
          user_id: wr.user_id,
          admin_id: auth.user.id,
          previous_balance: finalBalance + Number(wr.amount),
          amount: -Number(wr.amount),
          final_balance: finalBalance,
          type: "payout",
          reference_type: "payout_request",
          reference_id: wr.id,
          pool_id: null,
          comment: `${wr.provider} manual transfer ${reference}: ${reason}`,
        });
        to = "completed";
        patch.provider_reference = reference;
        patch.processed_at = now;
        patch.processed_by = auth.user.id;
        break;
      }
    }

    const { error } = await admin.from("payout_requests").update({ ...patch, status: to }).eq("id", id).eq("status", from);
    if (error) return NextResponse.json({ error: "Could not update the withdrawal" }, { status: 500 });

    await recordAdminAction({
      actorId: auth.user.id,
      action: `withdrawal.${action}`,
      targetType: "payout_request",
      targetId: id,
      before: { status: from },
      after: { status: to, amount: Number(wr.amount), provider: wr.provider, reference: reference ?? null },
      reason,
    });

    return NextResponse.json({ withdrawal: { id, status: to } }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
