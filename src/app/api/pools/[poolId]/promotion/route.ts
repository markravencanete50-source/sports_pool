import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { promotionRequestSchema, uuidParamSchema } from "@/lib/validations";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

/**
 * A pool owner asks for paid placement (private-pool advertising).
 *
 * Pricing is undecided by the client, so no money is taken here: the request
 * lands as `pending` with the window the owner asked for, and an admin
 * approves, prices and activates it from the console. When pricing lands the
 * payment step slots in before approval without touching this table's shape.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
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
    // RLS: owners see their own promotions; admins see all.
    const { data } = await supabase
      .from("pool_promotions")
      .select("id, status, placement, amount, currency, starts_at, ends_at, review_note, created_at")
      .eq("pool_id", poolId)
      .order("created_at", { ascending: false });
    return NextResponse.json({ promotions: data ?? [] }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "promotion:request", RATE_LIMITS.promotionRequest);
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
    const parsed = promotionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: pool } = await admin
      .from("pools")
      .select("id, created_by, type, status")
      .eq("id", poolId)
      .maybeSingle();
    if (!pool || pool.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (pool.status !== "open" && pool.status !== "active") {
      return NextResponse.json({ error: "Only open pools can be promoted" }, { status: 400 });
    }

    const { data: existing } = await admin
      .from("pool_promotions")
      .select("id, status")
      .eq("pool_id", poolId)
      .in("status", ["pending", "approved", "active", "paused"])
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: `This pool already has a ${existing.status} promotion`, code: "promotion_exists" },
        { status: 409 }
      );
    }

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + parsed.data.days * 24 * 3600_000);

    const { data: promo, error } = await admin
      .from("pool_promotions")
      .insert({
        pool_id: poolId,
        requested_by: user.id,
        status: "pending",
        placement: parsed.data.placement,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        review_note: parsed.data.note ?? null,
      })
      .select("id, status, placement, starts_at, ends_at")
      .single();
    if (error || !promo) {
      return NextResponse.json({ error: "Could not submit the promotion request" }, { status: 500 });
    }

    return NextResponse.json({ promotion: promo }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
