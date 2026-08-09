import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type RequireAdminResult =
  | { user: { id: string; app_metadata?: Record<string, unknown> } }
  | NextResponse;

export async function requireAdmin(
  supabase: SupabaseClient
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
  return { user };
}
