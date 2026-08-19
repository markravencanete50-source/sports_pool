import { createAdminClient } from "@/lib/supabase/admin";

/**
 * `ok` is the seed-script contract: `npm run seed` treats a skipped admin as
 * success (RUNBOOK §7.1 relies on that). `status` is the honest outcome for
 * callers that must NOT conflate "promoted" with "did nothing" — the
 * /api/seed-admin bootstrap endpoint returned 200 for every ok:true shape,
 * so an operator whose ADMIN_USER_EMAIL was unset (or whose admin had not
 * signed up yet) read a no-op as a completed bootstrap.
 */
export type SeedAdminStatus =
  | "promoted"
  | "already_admin"
  | "skipped_no_email"
  | "user_not_found"
  | "error";

export async function seedAdminUser(): Promise<{
  ok: boolean;
  status: SeedAdminStatus;
  message: string;
}> {
  const email = process.env.ADMIN_USER_EMAIL?.trim().toLowerCase();
  if (!email) {
    return {
      ok: true,
      status: "skipped_no_email",
      message: "ADMIN_USER_EMAIL not set, skipping",
    };
  }

  try {
    const admin = createAdminClient();

    const { data: users, error: userError } = await admin
      .from("users")
      .select("id, role")
      .eq("email", email)
      .limit(1);
    const user = users?.[0];

    if (userError) {
      return {
        ok: false,
        status: "error",
        message: `Error fetching user: ${userError.message}`,
      };
    }

    if (!user) {
      return {
        ok: true,
        status: "user_not_found",
        message: `User with email ${email} not found. Sign up first, then restart the server.`,
      };
    }

    if (user.role === "admin") {
      return {
        ok: true,
        status: "already_admin",
        message: `User ${email} is already admin`,
      };
    }

    const { error: authError } = await admin.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: { role: "admin" },
      }
    );

    if (authError) {
      return {
        ok: false,
        status: "error",
        message: `Error updating auth: ${authError.message}`,
      };
    }

    const { error: dbError } = await admin
      .from("users")
      .update({ role: "admin", updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (dbError) {
      return {
        ok: false,
        status: "error",
        message: `Error updating profile: ${dbError.message}`,
      };
    }

    return {
      ok: true,
      status: "promoted",
      message: `User ${email} promoted to admin`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: "error", message: `Seed failed: ${message}` };
  }
}
