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
 * One entry-fee transaction (pool_transactions row) in full, and the refund
 * bookkeeping on it. The refund itself is issued in the Stripe dashboard —
 * an operator with the card in front of them — and recorded here with the
 * Stripe refund id so the ledger, reconciliation and the user's history all
 * agree. Recording a refund is a money action: second factor required.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "transactions.view" });
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!isUuid(id)) return notFound("Transaction not found");
    const admin = createAdminClient();

    const { data: tx } = await admin
      .from("pool_transactions")
      .select("*, pools(id, name, status, type), parlay_cards(id, card_number, status)")
      .eq("id", id)
      .maybeSingle();
    if (!tx) return notFound("Transaction not found");

    const [{ data: user }, { data: related }, { data: audit }] = await Promise.all([
      admin.from("users").select("id, email, name, account_status").eq("id", tx.user_id).maybeSingle(),
      admin.from("user_transactions").select("id, type, amount, created_at").eq("pool_id", tx.pool_id).eq("user_id", tx.user_id).order("created_at", { ascending: false }),
      admin.from("admin_audit_log").select("id, actor_id, action, reason, after_state, created_at").eq("target_type", "pool_transaction").eq("target_id", id).order("created_at", { ascending: false }),
    ]);

    return NextResponse.json({ transaction: tx, user, related: related ?? [], audit: audit ?? [] }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const refundSchema = z.object({
  action: z.enum(["mark_refunded", "require_refund", "clear_refund"]),
  reason: z.string().trim().min(5).max(1000),
  /** mark_refunded: the Stripe refund id (re_…) or other provider reference. */
  reference: z.string().trim().min(3).max(120).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:refund", RATE_LIMITS.adminAction);
    if (limited) return limited;

    const { id } = await params;
    if (!isUuid(id)) return notFound("Transaction not found");

    const body = await request.json().catch(() => ({}));
    const parsed = refundSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
    const reasonCheck = requireReason(body);
    if (reasonCheck instanceof NextResponse) return reasonCheck;
    const { action, reference } = parsed.data;
    const { reason } = reasonCheck;

    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "transactions.refund", requireMfa: true });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data: tx } = await admin
      .from("pool_transactions")
      .select("id, pool_id, card_id, amount, refund_status, refund_reference")
      .eq("id", id)
      .maybeSingle();
    if (!tx) return notFound("Transaction not found");

    const patch: Record<string, unknown> = { refund_reason: reason };
    switch (action) {
      case "require_refund":
        if (tx.refund_status === "refunded") return badRequest("This entry has already been refunded");
        patch.refund_status = "refund_required";
        break;
      case "mark_refunded":
        if (!reference) return badRequest("The provider's refund reference is required");
        patch.refund_status = "refunded";
        patch.refund_reference = reference;
        patch.refunded_at = new Date().toISOString();
        patch.refunded_by = auth.user.id;
        break;
      case "clear_refund":
        if (tx.refund_status === "refunded") return badRequest("A recorded refund cannot be cleared");
        patch.refund_status = "none";
        break;
    }

    const { error } = await admin.from("pool_transactions").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: "Could not update the transaction" }, { status: 500 });

    // A refunded entry's card no longer competes.
    if (action === "mark_refunded" && tx.card_id) {
      await admin.from("parlay_cards").update({ status: "cancelled" }).eq("id", tx.card_id).in("status", ["pending", "active"]);
    }

    await recordAdminAction({
      actorId: auth.user.id,
      action: `transaction.${action}`,
      targetType: "pool_transaction",
      targetId: id,
      before: { refund_status: tx.refund_status, refund_reference: tx.refund_reference },
      after: { refund_status: patch.refund_status, refund_reference: patch.refund_reference ?? tx.refund_reference, amount: Number(tx.amount) },
      reason,
    });

    return NextResponse.json({ ok: true, refund_status: patch.refund_status }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
