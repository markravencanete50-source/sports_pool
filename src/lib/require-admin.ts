import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type RequireAdminResult =
  | { user: { id: string; app_metadata?: Record<string, unknown> } }
  | NextResponse;

export interface RequireAdminOptions {
  /**
   * Demand a second factor for this call.
   *
   * Set on the routes that move money or change privilege — payout completion,
   * role changes, platform-fee edits. Left off for read-only admin screens, so
   * an admin can still see the dashboard while they enrol.
   */
  requireMfa?: boolean;
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
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
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
  const isAdmin = (profile?.role as string) === "admin";
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Forbidden. Admin only." },
      { status: 403 }
    );
  }

  /*
   * SECOND FACTOR — audit finding BE-4.
   *
   * An admin can approve payouts and set the platform fee, so a single phished
   * password moved money. This is the step that closes it.
   *
   * The rollout problem with MFA enforcement is that switching it on before
   * anyone has enrolled locks every admin out of the system they would need in
   * order to enrol. So this does NOT check "is MFA on" — it checks the two
   * things that are individually safe:
   *
   *   1. If the admin HAS a verified factor, the session must actually be at
   *      aal2. Holding a factor you never present is not authentication.
   *   2. If they have NO factor, they are refused with an instruction to enrol,
   *      and the enrolment routes are deliberately not behind this check.
   *
   * Either way there is no state in which an admin is locked out of enrolling,
   * and no state in which a privileged action happens on one factor.
   */
  if (options.requireMfa) {
    const { data: aal, error: aalError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (aalError) {
      // Fail closed: unable to establish assurance level is not permission.
      return NextResponse.json(
        { error: "Could not verify your authentication level. Please sign in again." },
        { status: 403 }
      );
    }

    // nextLevel is aal2 exactly when the user has at least one verified factor.
    const hasVerifiedFactor = aal?.nextLevel === "aal2";
    const atAal2 = aal?.currentLevel === "aal2";

    if (!hasVerifiedFactor) {
      return NextResponse.json(
        {
          error:
            "Two-factor authentication is required for this action. " +
            "Set it up in your admin security settings, then try again.",
          code: "mfa_enrollment_required",
        },
        { status: 403 }
      );
    }

    if (!atAal2) {
      return NextResponse.json(
        {
          error:
            "This action needs two-factor verification. Please re-authenticate with your authenticator app.",
          code: "mfa_challenge_required",
        },
        { status: 403 }
      );
    }
  }

  return { user };
}
