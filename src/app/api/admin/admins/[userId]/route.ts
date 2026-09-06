import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin, requireReason } from "@/lib/require-admin";
import { recordAdminAction } from "@/lib/compliance/audit";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isUuid, badRequest, notFound } from "@/lib/admin/helpers";
import { ADMIN_ROLES } from "@/lib/admin/permissions";
import { z } from "zod";

/**
 * Set an administrator's role, or revoke admin entirely.
 *
 * Promotion to admin is the existing /api/admin/users/[userId]/role route
 * (it also stamps app_metadata); this route narrows or widens an admin who
 * already exists, and can demote. Super-admin only, second factor required,
 * and the last super admin can never be removed — a console nobody can
 * administer is an outage.
 */
const bodySchema = z.object({
  adminRole: z.enum([...ADMIN_ROLES, "revoke"] as [string, ...string[]]),
  reason: z.string().trim().min(5).max(1000),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:admins", RATE_LIMITS.adminAction);
    if (limited) return limited;

    const { userId } = await params;
    if (!isUuid(userId)) return notFound("User not found");

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
    const reasonCheck = requireReason(body);
    if (reasonCheck instanceof NextResponse) return reasonCheck;
    const { adminRole } = parsed.data;
    const { reason } = reasonCheck;

    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "admins.manage", requireMfa: true });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data: target } = await admin.from("users").select("id, role, admin_role").eq("id", userId).maybeSingle();
    if (!target) return notFound("User not found");
    if (target.role !== "admin") return badRequest("That user is not an administrator. Promote them first.");

    // Count super admins (role=admin with admin_role null or super_admin).
    const { data: supers } = await admin
      .from("users")
      .select("id, admin_role")
      .eq("role", "admin")
      .or("admin_role.is.null,admin_role.eq.super_admin");
    const superIds = new Set((supers ?? []).map((s) => s.id as string));
    const removingSuper = superIds.has(userId) && adminRole !== "super_admin";
    if (removingSuper && superIds.size <= 1) {
      return badRequest("This is the last super admin. Add another before changing this role.");
    }
    if (userId === auth.user.id && adminRole !== "super_admin") {
      return badRequest("You cannot reduce your own role; ask another super admin.");
    }

    const patch: Record<string, unknown> =
      adminRole === "revoke" ? { role: "user", admin_role: null } : { admin_role: adminRole };

    const { error } = await admin.from("users").update(patch).eq("id", userId);
    if (error) return NextResponse.json({ error: "Could not update the role" }, { status: 500 });

    if (adminRole === "revoke") {
      // Keep the JWT claim in step with the table (the table is authoritative,
      // but the claim is what private.is_admin() consults first).
      try {
        await admin.auth.admin.updateUserById(userId, { app_metadata: { role: "user" } });
      } catch {
        /* table-authoritative checks still refuse */
      }
    }

    await recordAdminAction({
      actorId: auth.user.id,
      action: adminRole === "revoke" ? "admin.revoke" : "admin.role_changed",
      targetType: "user",
      targetId: userId,
      before: { role: target.role, admin_role: target.admin_role },
      after: patch,
      reason,
    });

    return NextResponse.json({ ok: true, ...patch }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
