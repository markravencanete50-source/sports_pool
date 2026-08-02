import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

const ROLES = ["user", "admin"] as const;

function isRole(value: unknown): value is (typeof ROLES)[number] {
  return typeof value === "string" && ROLES.includes(value as (typeof ROLES)[number]);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    const body = await request.json().catch(() => ({}));
    const role = body.role;
    if (!isRole(role)) {
      return NextResponse.json(
        { error: "Invalid role. Use 'admin' or 'user'." },
        { status: 400 }
      );
    }

    if (userId === user.id && role === "user") {
      return NextResponse.json(
        { error: "You cannot remove your own admin role." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(
      userId,
      { app_metadata: { role } }
    );
    if (authUpdateError) {
      return NextResponse.json(
        { error: authUpdateError.message },
        { status: 400 }
      );
    }

    const { error: dbError } = await admin
      .from("users")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (dbError) {
      return NextResponse.json(
        { error: dbError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ role }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
