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
 * Decide an existing account's age review.
 *
 *   review  → put the account under review (blocks money until decided)
 *   approve → clears the review; optionally records a corrected date of birth
 *   reject  → keeps money blocked and blocks the account
 *
 * The compliance gate reads age_review_status at every money boundary, so
 * the decision takes effect on the next attempt without a redeploy.
 */
const bodySchema = z.object({
  action: z.enum(["review", "approve", "reject"]),
  reason: z.string().trim().min(5).max(1000),
  /** approve only: a verified date of birth to record (yyyy-mm-dd). */
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:age-review", RATE_LIMITS.adminAction);
    if (limited) return limited;

    const { userId } = await params;
    if (!isUuid(userId)) return notFound("User not found");

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
    const reasonCheck = requireReason(body);
    if (reasonCheck instanceof NextResponse) return reasonCheck;
    const { action, dateOfBirth } = parsed.data;
    const { reason } = reasonCheck;

    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "compliance.review" });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data: before } = await admin
      .from("user_compliance")
      .select("user_id, date_of_birth, age_review_status, age_review_reason")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: userRow } = await admin.from("users").select("id, account_status").eq("id", userId).maybeSingle();
    if (!userRow) return notFound("User not found");

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      user_id: userId,
      age_review_status: action === "review" ? "pending" : action === "approve" ? "approved" : "rejected",
      age_review_note: reason,
      age_reviewed_by: action === "review" ? null : auth.user.id,
      age_reviewed_at: action === "review" ? null : now,
    };
    if (action === "review") patch.age_review_reason = reason;
    if (action === "approve" && dateOfBirth) {
      patch.date_of_birth = dateOfBirth;
      patch.age_verified_at = now;
    }

    const { error } = await admin.from("user_compliance").upsert(patch, { onConflict: "user_id" });
    if (error) {
      return NextResponse.json({ error: "Could not record the decision" }, { status: 500 });
    }

    // A rejected review blocks the account outright; approving lifts a block
    // that was applied for age (and only that — other reasons stand).
    if (action === "reject" && userRow.account_status === "active") {
      await admin
        .from("users")
        .update({
          account_status: "blocked",
          status_reason: `Age review rejected: ${reason}`,
          status_changed_at: now,
          status_changed_by: auth.user.id,
        })
        .eq("id", userId);
    }

    await recordAdminAction({
      actorId: auth.user.id,
      action: `compliance.age_review.${action}`,
      targetType: "user",
      targetId: userId,
      before: before ?? null,
      after: { age_review_status: patch.age_review_status, date_of_birth: patch.date_of_birth ?? before?.date_of_birth ?? null },
      reason,
    });

    return NextResponse.json({ ok: true, age_review_status: patch.age_review_status }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
