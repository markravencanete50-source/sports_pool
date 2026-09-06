import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  hasPermission,
  permissionsFor,
  resolveAdminRole,
  type AdminRole,
  type Permission,
} from "@/lib/admin/permissions";

export type AdminIdentity = {
  user: { id: string; app_metadata?: Record<string, unknown> };
  /** Effective admin role; null never escapes this helper (it is a 403). */
  adminRole: AdminRole;
  permissions: readonly Permission[];
};

export type RequireAdminResult = AdminIdentity | NextResponse;

export interface RequireAdminOptions {
  /**
   * Retained for existing callers. Every admin API now requires aal2;
   * enrolment uses the separate authenticated /api/me/mfa routes.
   */
  requireMfa?: boolean;
  /**
   * Permission(s) the caller's admin role must hold. Omitted means "any
   * admin", which is what the pre-roles routes meant and still mean.
   */
  permission?: Permission | readonly Permission[];
}

export async function requireAdmin(
  supabase: SupabaseClient,
  options: RequireAdminOptions = {}
): Promise<RequireAdminResult> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role, admin_role, account_status")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    return NextResponse.json({ error: "Could not verify admin access." }, { status: 403 });
  }
  /*
   * The users table is AUTHORITATIVE. The JWT's app_metadata.role claim is
   * deliberately NOT consulted.
   *
   * Supabase cannot revoke an already-issued access token, so honouring the
   * claim meant a demoted or offboarded admin kept full admin API access until
   * their token expired (JWT_EXPIRY, an hour by default) even though the role
   * change had already been written. public.is_admin() in the database was made
   * table-authoritative for the same reason; this is the matching change at the
   * API layer so the two agree.
   *
   * Both writers keep the table in step: the role route updates users.role and
   * app_metadata together, and seedAdminUser() writes the users row too.
   */
  const adminRole = resolveAdminRole({
    role: profile?.role as string | null | undefined,
    admin_role: profile?.admin_role as string | null | undefined,
  });
  if (!adminRole) {
    return NextResponse.json(
      { error: "Forbidden. Admin only." },
      { status: 403 }
    );
  }

  // A blocked or suspended admin is not an admin. The status is what the
  // console itself sets, so an offboarded operator loses the console the
  // moment their account is closed, not when their token expires.
  if (profile.account_status !== "active") {
    return NextResponse.json(
      { error: "Forbidden. This account is not active.", code: "account_inactive" },
      { status: 403 }
    );
  }

  // Enrolment does not require admin access, so an unenrolled account must
  // never bypass the console's MFA gate through a direct API request.
  const { data: aal, error: aalError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || !aal) {
    return NextResponse.json(
      { error: "Could not verify your authentication level. Please sign in again." },
      { status: 403 }
    );
  }
  if (aal.nextLevel !== "aal2") {
    return NextResponse.json(
      { error: "Set up two-factor authentication in account security.", code: "mfa_enrollment_required" },
      { status: 403 }
    );
  }
  if (aal.currentLevel !== "aal2") {
    return NextResponse.json(
      { error: "Verify this session with your authenticator app.", code: "mfa_challenge_required" },
      { status: 403 }
    );
  }

  if (options.permission && !hasPermission(adminRole, options.permission)) {
    return NextResponse.json(
      {
        error: "Forbidden. Your admin role does not include this action.",
        code: "permission_denied",
        required: Array.isArray(options.permission)
          ? options.permission
          : [options.permission],
      },
      { status: 403 }
    );
  }

  return { user, adminRole, permissions: permissionsFor(adminRole) };
}

/**
 * Read an admin reason out of a parsed body. Consequential actions require one
 * so the audit row explains itself; the minimum length stops "x".
 */
export function requireReason(
  body: unknown,
  minLength = 5
): { reason: string } | NextResponse {
  const raw = (body as { reason?: unknown } | null)?.reason;
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length < minLength) {
    return NextResponse.json(
      { error: `A reason of at least ${minLength} characters is required.`, code: "reason_required" },
      { status: 400 }
    );
  }
  if (reason.length > 1000) {
    return NextResponse.json(
      { error: "Reason is too long (max 1000 characters).", code: "reason_too_long" },
      { status: 400 }
    );
  }
  return { reason };
}
