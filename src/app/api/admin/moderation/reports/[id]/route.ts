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
 * Resolve a report. `contentAction` optionally acts on the reported message
 * in the same step (hide / delete / restore), so "review → remove content →
 * resolve" is one confirmed click rather than three.
 */
const bodySchema = z.object({
  action: z.enum(["resolve", "dismiss", "reopen"]),
  reason: z.string().trim().min(3).max(1000),
  contentAction: z.enum(["hide", "delete", "restore", "none"]).default("none"),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:report", RATE_LIMITS.adminAction);
    if (limited) return limited;

    const { id } = await params;
    if (!isUuid(id)) return notFound("Report not found");

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
    const reasonCheck = requireReason(body, 3);
    if (reasonCheck instanceof NextResponse) return reasonCheck;
    const { action, contentAction } = parsed.data;
    const { reason } = reasonCheck;

    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "moderation.manage" });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data: report } = await admin
      .from("content_reports")
      .select("id, status, comment_id, reported_user_id")
      .eq("id", id)
      .maybeSingle();
    if (!report) return notFound("Report not found");

    const now = new Date().toISOString();
    let contentResult: string | null = null;
    if (contentAction !== "none" && report.comment_id) {
      const status = contentAction === "hide" ? "hidden" : contentAction === "delete" ? "deleted" : "visible";
      await admin
        .from("comments")
        .update({ moderation_status: status, moderated_by: auth.user.id, moderated_at: now, moderation_reason: reason })
        .eq("id", report.comment_id);
      contentResult = status;
    }

    const status = action === "resolve" ? "resolved" : action === "dismiss" ? "dismissed" : "pending";
    const { error } = await admin
      .from("content_reports")
      .update({
        status,
        action_taken: contentResult ? `comment_${contentResult}` : action === "dismiss" ? "none" : null,
        resolved_by: status === "pending" ? null : auth.user.id,
        resolved_at: status === "pending" ? null : now,
        resolution_note: reason,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: "Could not update the report" }, { status: 500 });

    await recordAdminAction({
      actorId: auth.user.id,
      action: `moderation.report.${action}`,
      targetType: "content_report",
      targetId: id,
      before: { status: report.status },
      after: { status, contentAction: contentResult },
      reason,
    });

    return NextResponse.json({ ok: true, status, contentAction: contentResult }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
