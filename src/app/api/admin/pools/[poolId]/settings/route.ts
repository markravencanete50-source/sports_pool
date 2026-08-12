import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/require-admin";
import { recordAdminAction } from "@/lib/compliance/audit";
import { updatePoolSchema } from "@/lib/validations";
import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * SECURITY: this route lives under /api/admin/ but authorized on pool
 * OWNERSHIP, not on the admin role — `pool.created_by !== user.id`.
 *
 * Since the payload can set a pool's status, any user who created a pool could
 * drive its lifecycle themselves: flip it to completed to trigger winner
 * materialisation and credit a balance, with no admin ever in the loop before
 * real money moved — and potentially reopen and re-complete it to pay the pot
 * out more than once.
 *
 * Admin role is now required. Ownership is not authority over settlement.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:mutate", RATE_LIMITS.adminMutate);
    if (limited) return limited;

    const { poolId } = await params;
    const supabase = await createClient();

    const auth = await requireAdmin(supabase, { requireMfa: true });
    if (auth instanceof NextResponse) return auth;

    const { data: pool } = await supabase
      .from("pools")
      .select("id")
      .eq("id", poolId)
      .maybeSingle();

    if (!pool) {
      return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = updatePoolSchema.parse(body);

    /*
     * Perform the write as service role, NOT with the caller's client.
     *
     * Migration 20260806000000 revokes UPDATE on pools from `authenticated` and
     * grants back only (name, max_participants), because RLS cannot restrict
     * which columns an UPDATE touches — a with_check of `auth.uid() =
     * created_by` still permits `set status = 'completed'` straight through
     * PostgREST. Columns like status, entry_fee and prize_pot are therefore
     * unwritable by any client session, including an admin's.
     *
     * Authorization is already established above by requireAdmin(), so the
     * privileged write is escalated deliberately and only after that gate.
     */
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("pools")
      .update(validatedData)
      .eq("id", poolId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    await recordAdminAction({
      actorId: auth.user.id,
      action: "pool.settings_changed",
      targetType: "pool",
      targetId: poolId,
      after: data as unknown,
    });

    return NextResponse.json({ pool: data }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation error", details: error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
