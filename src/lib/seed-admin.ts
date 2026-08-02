import { createAdminClient } from "@/lib/supabase/admin";

export async function seedAdminUser(): Promise<{
  ok: boolean;
  message: string;
}> {
  const email = process.env.ADMIN_USER_EMAIL?.trim().toLowerCase();
  if (!email) {
    return { ok: true, message: "ADMIN_USER_EMAIL not set, skipping" };
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
        message: `Error fetching user: ${userError.message}`,
      };
    }

    if (!user) {
      return {
        ok: true,
        message: `User with email ${email} not found. Sign up first, then restart the server.`,
      };
    }

    if (user.role === "admin") {
      return { ok: true, message: `User ${email} is already admin` };
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
        message: `Error updating profile: ${dbError.message}`,
      };
    }

    return { ok: true, message: `User ${email} promoted to admin` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Seed failed: ${message}` };
  }
}
