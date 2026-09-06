import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { poolAccessSchema, uuidParamSchema } from "@/lib/validations";
import { verifyPoolPassword } from "@/lib/pool-password";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

/**
 * Join a password-protected private pool.
 *
 * The password is the access method the brief asked for alongside links and
 * QR codes. A correct password does exactly what accepting an invitation
 * does — adds a pool_participants row — so everything downstream (RLS on the
 * pool, chat access, purchase) already understands the result. Nothing is
 * cached in a cookie; membership is the record.
 *
 * Rate-limited hard: pool passwords are low-entropy shared secrets.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "pool:access", RATE_LIMITS.poolAccess);
    if (limited) return limited;

    const { poolId } = await params;
    if (!uuidParamSchema.safeParse(poolId).success) {
      return NextResponse.json({ error: "Invalid pool id" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = poolAccessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: pool } = await admin
      .from("pools")
      .select("id, type, status, access_password_hash")
      .eq("id", poolId)
      .maybeSingle();

    if (!pool) {
      return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    }
    if (!pool.access_password_hash) {
      return NextResponse.json(
        { error: "This pool does not use a password", code: "no_password" },
        { status: 400 }
      );
    }
    if (pool.status === "cancelled" || pool.status === "completed") {
      return NextResponse.json(
        { error: "This pool is no longer accepting players" },
        { status: 400 }
      );
    }

    if (!verifyPoolPassword(parsed.data.password, pool.access_password_hash as string)) {
      // Same shape and timing as any other refusal; the limiter does the rest.
      return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
    }

    const { error: joinError } = await admin
      .from("pool_participants")
      .upsert({ pool_id: poolId, user_id: user.id }, { onConflict: "pool_id,user_id", ignoreDuplicates: true });
    if (joinError && joinError.code !== "23505") {
      return NextResponse.json({ error: "Could not join the pool" }, { status: 500 });
    }

    return NextResponse.json({ joined: true, poolId }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
