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
 * Decide a refused signup. Approving lifts the block for that address so the
 * person can register again (their date of birth must still pass the
 * schema floor); rejecting keeps it refused. Either way, with a reason.
 */
const bodySchema = z.object({
  action: z.enum(["approve", "reject", "reopen"]),
  reason: z.string().trim().min(5).max(1000),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:signup-review", RATE_LIMITS.adminAction);
    if (limited) return limited;

    const { id } = await params;
    if (!isUuid(id)) return notFound("Record not found");

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
    const reasonCheck = requireReason(body);
    if (reasonCheck instanceof NextResponse) return reasonCheck;
    const { reason } = reasonCheck;

    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "compliance.review" });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data: before } = await admin.from("blocked_signups").select("id, email, status").eq("id", id).maybeSingle();
    if (!before) return notFound("Record not found");

    const status = parsed.data.action === "approve" ? "approved" : parsed.data.action === "reject" ? "rejected" : "pending";
    const { error } = await admin
      .from("blocked_signups")
      .update({
        status,
        reviewed_by: status === "pending" ? null : auth.user.id,
        reviewed_at: status === "pending" ? null : new Date().toISOString(),
        review_note: reason,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: "Could not record the decision" }, { status: 500 });

    await recordAdminAction({
      actorId: auth.user.id,
      action: `compliance.signup.${parsed.data.action}`,
      targetType: "blocked_signup",
      targetId: id,
      before: { status: before.status },
      after: { status },
      reason,
    });

    return NextResponse.json({ ok: true, status }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
