import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ADMIN_ROLE_LABELS, permissionsFor, resolveAdminRole } from "@/lib/admin/permissions";

/** Every administrator with their effective role and permission set. */
export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "admins.view" });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("users")
      .select("id, email, name, role, admin_role, account_status, created_at, last_active_at")
      .eq("role", "admin")
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const admins = (data ?? []).map((u) => {
      const role = resolveAdminRole(u);
      return {
        ...u,
        effective_role: role,
        role_label: role ? ADMIN_ROLE_LABELS[role] : null,
        permissions: permissionsFor(role),
      };
    });

    return NextResponse.json({ admins, roles: ADMIN_ROLE_LABELS }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
