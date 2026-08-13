import { seedAdminUser } from "@/lib/seed-admin";
import { requireSecret } from "@/lib/require-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * One-time admin bootstrap. Promotes the account matching ADMIN_USER_EMAIL.
 *
 * SECURITY: this endpoint previously took NO authentication while performing a
 * privileged write with the Supabase SERVICE-ROLE key. Two problems:
 *   1. Whoever registered the ADMIN_USER_EMAIL address could call this and grant
 *      themselves admin on demand.
 *   2. The response body was an unauthenticated oracle for whether that account
 *      exists and whether it is already admin.
 *
 * It cannot require an admin session (it runs before any admin exists), so it is
 * gated on SETUP_SECRET and fails closed when that is unset. Responses are now
 * generic — the detailed result is logged server-side only.
 *
 * SELF-DISABLING. The audit listed "unset SETUP_SECRET once the admin account
 * exists" as a High item, because a forgotten secret leaves a service-role write
 * path open indefinitely. Relying on someone remembering a cleanup step is a
 * weak control — especially across a handover, where the person who set the
 * variable is not the person operating the system.
 *
 * So the endpoint now refuses once ANY admin exists. Bootstrap is by definition
 * a once-ever operation, and after it the only correct answer is no. Unsetting
 * SETUP_SECRET is still good hygiene, but forgetting it is no longer a hole.
 */
export async function POST(request: Request) {
  const denied = requireSecret(request, "SETUP_SECRET");
  if (denied) return denied;

  // Fail closed on both branches: if this cannot be established, do not proceed.
  try {
    const { count, error } = await createAdminClient()
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if (error) {
      console.error("[seed-admin] could not check for existing admins:", error.message);
      return NextResponse.json(
        { error: "Bootstrap unavailable." },
        { status: 503 }
      );
    }

    if ((count ?? 0) > 0) {
      console.info("[seed-admin] refused: an admin already exists");
      return NextResponse.json(
        { error: "Bootstrap has already been completed." },
        { status: 410 }
      );
    }
  } catch (err) {
    console.error("[seed-admin] admin check threw:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Bootstrap unavailable." }, { status: 503 });
  }

  const result = await seedAdminUser();

  // Log detail for the operator; do not return it to the caller.
  console.info("[seed-admin]", result.message);

  return NextResponse.json(
    { ok: result.ok },
    { status: result.ok ? 200 : 500 }
  );
}
