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
 * Promotion decisions. Approving activates the campaign for the requested
 * window (or one supplied here); pricing fields are recorded as data so the
 * model can change without a migration.
 *   approve  pending → active     reject  pending → rejected
 *   pause    active → paused      resume  paused → active
 *   cancel   any live → cancelled extend  active|paused: ends_at += days
 */
const bodySchema = z.object({
  action: z.enum(["approve", "reject", "pause", "resume", "cancel", "extend"]),
  reason: z.string().trim().min(3).max(1000),
  days: z.number().int().min(1).max(90).optional(),
  amount: z.number().min(0).max(100000).optional(),
  pricingModel: z.enum(["flat", "tiered", "auction", "complimentary"]).optional(),
  placement: z.enum(["featured", "boosted", "spotlight"]).optional(),
  paymentReference: z.string().trim().max(120).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:promotion", RATE_LIMITS.adminAction);
    if (limited) return limited;

    const { id } = await params;
    if (!isUuid(id)) return notFound("Promotion not found");

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
    const reasonCheck = requireReason(body, 3);
    if (reasonCheck instanceof NextResponse) return reasonCheck;
    const { action, days, amount, pricingModel, placement, paymentReference } = parsed.data;
    const { reason } = reasonCheck;

    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "promotions.manage" });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data: promo } = await admin
      .from("pool_promotions")
      .select("id, pool_id, status, starts_at, ends_at, amount, placement")
      .eq("id", id)
      .maybeSingle();
    if (!promo) return notFound("Promotion not found");

    const from = promo.status as string;
    const now = new Date();
    const patch: Record<string, unknown> = { review_note: reason };
    let to: string;

    switch (action) {
      case "approve": {
        if (from !== "pending") return badRequest(`A ${from} promotion cannot be approved`);
        const start = promo.starts_at && new Date(promo.starts_at) > now ? new Date(promo.starts_at) : now;
        const end = days ? new Date(start.getTime() + days * 24 * 3600_000) : promo.ends_at ? new Date(promo.ends_at) : new Date(start.getTime() + 7 * 24 * 3600_000);
        if (end <= start) return badRequest("The promotion must end after it starts");
        to = "active";
        patch.starts_at = start.toISOString();
        patch.ends_at = end.toISOString();
        patch.approved_by = auth.user.id;
        patch.approved_at = now.toISOString();
        if (amount != null) patch.amount = amount;
        if (pricingModel) patch.pricing_model = pricingModel;
        if (placement) patch.placement = placement;
        if (paymentReference) {
          patch.payment_reference = paymentReference;
          patch.paid_at = now.toISOString();
        }
        break;
      }
      case "reject":
        if (from !== "pending") return badRequest(`A ${from} promotion cannot be rejected`);
        to = "rejected";
        break;
      case "pause":
        if (from !== "active") return badRequest("Only an active promotion can be paused");
        to = "paused";
        break;
      case "resume":
        if (from !== "paused") return badRequest("Only a paused promotion can be resumed");
        to = "active";
        break;
      case "cancel":
        if (!["pending", "approved", "active", "paused"].includes(from)) return badRequest(`A ${from} promotion cannot be cancelled`);
        to = "cancelled";
        break;
      case "extend": {
        if (!["active", "paused"].includes(from)) return badRequest("Only a live promotion can be extended");
        if (!days) return badRequest("Say how many days to extend by");
        const base = promo.ends_at && new Date(promo.ends_at) > now ? new Date(promo.ends_at) : now;
        patch.ends_at = new Date(base.getTime() + days * 24 * 3600_000).toISOString();
        to = from;
        break;
      }
    }

    const { error } = await admin.from("pool_promotions").update({ ...patch, status: to }).eq("id", id);
    if (error) return NextResponse.json({ error: "Could not update the promotion" }, { status: 500 });

    await recordAdminAction({
      actorId: auth.user.id,
      action: `promotion.${action}`,
      targetType: "pool_promotion",
      targetId: id,
      before: { status: from, ends_at: promo.ends_at, amount: promo.amount },
      after: { status: to, ends_at: patch.ends_at ?? promo.ends_at, amount: patch.amount ?? promo.amount },
      reason,
    });

    return NextResponse.json({ promotion: { id, status: to, ends_at: patch.ends_at ?? promo.ends_at } }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
