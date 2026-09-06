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
 * Block / unblock / suspend / restore a user.
 *
 * Every transition needs a reason and lands in the audit log with the
 * before/after standing. Blocking or suspending also revokes the user's
 * sessions so the change bites immediately, not at token expiry.
 */
const bodySchema = z.object({
  action: z.enum(["block", "unblock", "suspend", "restore"]),
  reason: z.string().trim().min(5).max(1000),
  /** Suspend only: days from now; omitted = indefinite. */
  days: z.number().int().min(1).max(365).optional(),
});

const PERMISSION_FOR = {
  block: "users.block",
  unblock: "users.unblock",
  suspend: "users.suspend",
  restore: "users.unblock",
} as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:user-status", RATE_LIMITS.adminAction);
    if (limited) return limited;

    const { userId } = await params;
    if (!isUuid(userId)) return notFound("User not found");

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
    const reasonCheck = requireReason(body);
    if (reasonCheck instanceof NextResponse) return reasonCheck;
    const { action, days } = parsed.data;
    const { reason } = reasonCheck;

    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: PERMISSION_FOR[action] });
    if (auth instanceof NextResponse) return auth;

    if (auth.user.id === userId) {
      return badRequest("You cannot change your own account standing.");
    }

    const admin = createAdminClient();
    const { data: target } = await admin
      .from("users")
      .select("id, role, account_status, suspended_until, status_reason")
      .eq("id", userId)
      .maybeSingle();
    if (!target) return notFound("User not found");

    // Only a super admin may act on another admin's standing.
    if (target.role === "admin" && auth.adminRole !== "super_admin") {
      return NextResponse.json(
        { error: "Only a super admin can change another administrator's standing." },
        { status: 403 }
      );
    }

    const now = new Date();
    const patch: Record<string, unknown> = {
      status_reason: reason,
      status_changed_at: now.toISOString(),
      status_changed_by: auth.user.id,
    };
    switch (action) {
      case "block":
        patch.account_status = "blocked";
        patch.suspended_until = null;
        break;
      case "suspend":
        patch.account_status = "suspended";
        patch.suspended_until = days ? new Date(now.getTime() + days * 24 * 3600_000).toISOString() : null;
        break;
      case "unblock":
      case "restore":
        patch.account_status = "active";
        patch.suspended_until = null;
        break;
    }

    const { error } = await admin.from("users").update(patch).eq("id", userId);
    if (error) {
      return NextResponse.json({ error: "Could not update the account" }, { status: 500 });
    }

    // Revoke sessions on block/suspend so the change is immediate.
    if (patch.account_status !== "active") {
      try {
        await admin.auth.admin.signOut(userId, "global" as never);
      } catch {
        // Best-effort: the signin and money gates refuse the account anyway.
      }
    }

    await recordAdminAction({
      actorId: auth.user.id,
      action: `user.${action}`,
      targetType: "user",
      targetId: userId,
      before: { account_status: target.account_status, suspended_until: target.suspended_until },
      after: { account_status: patch.account_status, suspended_until: patch.suspended_until },
      reason,
    });

    return NextResponse.json(
      { user: { id: userId, account_status: patch.account_status, suspended_until: patch.suspended_until } },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
