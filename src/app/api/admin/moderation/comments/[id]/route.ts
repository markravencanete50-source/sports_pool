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
 * Moderate one chat message: hide / delete / restore / flag, optionally with
 * a warning to its author (a notification) and/or a suspension of the
 * author's account. Hiding and deleting are both soft — the row stays, the
 * RLS policy makes it invisible to players — so a wrong call is reversible.
 */
const bodySchema = z.object({
  action: z.enum(["hide", "delete", "restore", "flag", "warn", "suspend_author"]),
  reason: z.string().trim().min(3).max(1000),
  /** suspend_author: days; omitted = 7. */
  days: z.number().int().min(1).max(365).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:moderate-comment", RATE_LIMITS.adminAction);
    if (limited) return limited;

    const { id } = await params;
    if (!isUuid(id)) return notFound("Comment not found");

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
    const reasonCheck = requireReason(body, 3);
    if (reasonCheck instanceof NextResponse) return reasonCheck;
    const { action, days } = parsed.data;
    const { reason } = reasonCheck;

    const supabase = await createClient();
    const auth = await requireAdmin(supabase, {
      permission: action === "suspend_author" ? ["moderation.manage", "users.suspend"] : "moderation.manage",
    });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data: comment } = await admin
      .from("comments")
      .select("id, pool_id, user_id, text, moderation_status")
      .eq("id", id)
      .maybeSingle();
    if (!comment) return notFound("Comment not found");

    const now = new Date().toISOString();
    const after: Record<string, unknown> = {};

    if (["hide", "delete", "restore", "flag"].includes(action)) {
      const status = action === "hide" ? "hidden" : action === "delete" ? "deleted" : action === "flag" ? "flagged" : "visible";
      const { error } = await admin
        .from("comments")
        .update({ moderation_status: status, moderated_by: auth.user.id, moderated_at: now, moderation_reason: reason })
        .eq("id", id);
      if (error) return NextResponse.json({ error: "Could not update the message" }, { status: 500 });
      after.moderation_status = status;
    }

    if (action === "warn") {
      const { error } = await admin.from("notifications").insert({
        user_id: comment.user_id,
        type: "moderation_warning",
        title: "A warning from the moderators",
        message: `One of your chat messages broke the pool chat rules: ${reason}. Repeat violations can lead to suspension.`,
        data: { comment_id: id, pool_id: comment.pool_id },
      });
      if (error) return NextResponse.json({ error: "Could not send the warning" }, { status: 500 });
      after.warned = true;
    }

    if (action === "suspend_author") {
      const until = new Date(Date.now() + (days ?? 7) * 24 * 3600_000).toISOString();
      const { error } = await admin
        .from("users")
        .update({
          account_status: "suspended",
          suspended_until: until,
          status_reason: `Chat moderation: ${reason}`,
          status_changed_at: now,
          status_changed_by: auth.user.id,
        })
        .eq("id", comment.user_id)
        .neq("role", "admin");
      if (error) return NextResponse.json({ error: "Could not suspend the author" }, { status: 500 });
      await admin
        .from("comments")
        .update({ moderation_status: "hidden", moderated_by: auth.user.id, moderated_at: now, moderation_reason: reason })
        .eq("id", id);
      after.suspended_until = until;
      after.moderation_status = "hidden";
    }

    await recordAdminAction({
      actorId: auth.user.id,
      action: `moderation.comment.${action}`,
      targetType: action === "suspend_author" ? "user" : "comment",
      targetId: action === "suspend_author" ? comment.user_id : id,
      before: { moderation_status: comment.moderation_status, text: String(comment.text).slice(0, 200) },
      after,
      reason,
    });

    return NextResponse.json({ ok: true, ...after }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
