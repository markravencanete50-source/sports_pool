import { seedAdminUser } from "@/lib/seed-admin";
import { requireSecret } from "@/lib/require-secret";
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
 */
export async function POST(request: Request) {
  const denied = requireSecret(request, "SETUP_SECRET");
  if (denied) return denied;

  const result = await seedAdminUser();

  // Log detail for the operator; do not return it to the caller.
  console.info("[seed-admin]", result.message);

  return NextResponse.json(
    { ok: result.ok },
    { status: result.ok ? 200 : 500 }
  );
}
