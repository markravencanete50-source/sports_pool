import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SHARE_SLUG_PATTERN } from "@/lib/pool-password";
import { NextResponse } from "next/server";

/**
 * Resolve a share link (/p/<slug>) to what the visitor may do with it.
 *
 * Deliberately minimal: a slug is public by construction (it is printed on
 * QR codes), so this returns only what a landing page needs — the name, the
 * fee, whether a password is needed, and whether the caller is already in.
 * Private-pool internals stay behind RLS on /api/pools/[poolId].
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!SHARE_SLUG_PATTERN.test(slug)) {
      return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    }

    const admin = createAdminClient();
    const { data: pool } = await admin
      .from("pools")
      .select("id, name, type, status, entry_fee, week, sport, starts_at, ends_at, access_password_hash, created_by")
      .eq("share_slug", slug)
      .maybeSingle();
    if (!pool) {
      return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let isParticipant = false;
    if (user) {
      const { data: row } = await admin
        .from("pool_participants")
        .select("id")
        .eq("pool_id", pool.id)
        .eq("user_id", user.id)
        .maybeSingle();
      isParticipant = !!row || pool.created_by === user.id;
    }

    const requiresPassword = Boolean(pool.access_password_hash);
    const closed = pool.status === "cancelled" || pool.status === "completed";
    const canEnter = pool.type === "public" || isParticipant;

    return NextResponse.json(
      {
        pool: {
          id: pool.id,
          name: pool.name,
          type: pool.type,
          status: pool.status,
          entryFee: Number(pool.entry_fee),
          week: pool.week,
          sport: pool.sport,
          startsAt: pool.starts_at,
          endsAt: pool.ends_at,
        },
        signedIn: !!user,
        isParticipant,
        requiresPassword,
        canEnter,
        closed,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
