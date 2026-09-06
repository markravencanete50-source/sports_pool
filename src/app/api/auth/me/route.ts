import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user profile — named columns, not *. The row also carries the
    // console's internal fields (admin_note, status_reason, who changed the
    // status), which are revoked from the authenticated role and must never
    // reach the person the note is about.
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select(
        "id, email, name, avatar, role, admin_role, balance, account_status, suspended_until, tenant_id, last_active_at, created_at, updated_at"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[auth/me]", profileError.message);
      return NextResponse.json(
        { error: "Failed to fetch user profile" },
        { status: 500 }
      );
    }

    // Profile row can legitimately be absent (auth user exists but the profile
    // insert never completed). Return the auth user rather than 500.
    return NextResponse.json(
      { user: { ...user, ...(profile ?? {}) } },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
