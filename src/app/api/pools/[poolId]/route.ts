import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPoolFinancials } from "@/lib/pool-financials";
import { updatePoolWithGamesSchema } from "@/lib/validations";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { logDbError } from "@/lib/error-utils";

// SECURITY: never embed `users(*)`. That table carries email, role and balance,
// and the shipped RLS policy on it was `select using (true)` — so an
// unauthenticated GET of any pool returned the email, role and cash balance of
// every participant, every commenter and the pool creator in one JSON blob.
// Enumerate display-only columns instead.
// Display names come from public.profiles, NOT public.users: users is locked to
// own-row SELECT, so an embedded users(...) resolves to NULL for everyone except
// the caller and every other player renders as "Unknown".
const USER_PUBLIC_COLS = "id, name, avatar";

const poolDetailSelect = `
  *,
  pool_games(game_id, games(*)),
  pool_participants(user_id, users:profiles!pool_participants_user_id_profiles_fkey(${USER_PUBLIC_COLS})),
  comments(*, users:profiles!comments_user_id_profiles_fkey(${USER_PUBLIC_COLS})),
  created_by_user:profiles!pools_created_by_profiles_fkey(${USER_PUBLIC_COLS})
`;

// Row shape of the `.select("id, week")` games query in PATCH.
type GameWeekRow = { id: string; week: number | null };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const { poolId } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("pools")
      .select(poolDetailSelect)
      .eq("id", poolId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    }

    // get_pool_financials EXECUTE is revoked from client roles; it returns
    // aggregates this endpoint already exposes publicly. The parlay count runs
    // as admin so can_edit matches the RLS-independent freeze check in PATCH.
    const admin = createAdminClient();
    const financials = await getPoolFinancials(admin, poolId);

    const [{ count: joinedCount }, { data: secretCols }, { data: activePromo }] = await Promise.all([
      admin
        .from("parlay_cards")
        .select("*", { count: "exact", head: true })
        .eq("pool_id", poolId)
        .in("status", ["pending", "active", "completed"]),
      // The hash itself is never returned — only whether one exists, so the
      // UI can show the "password protected" badge to the owner.
      admin.from("pools").select("access_password_hash").eq("id", poolId).maybeSingle(),
      admin
        .from("pool_promotions")
        .select("id, status, placement, starts_at, ends_at")
        .eq("pool_id", poolId)
        .in("status", ["pending", "approved", "active", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const { access_password_hash: _omit, ...publicData } = data as Record<string, unknown> & {
      access_password_hash?: string | null;
    };
    void _omit;

    const pool = {
      ...publicData,
      prize_pot: financials.prize_pot,
      participants: financials.paid_participant_count,
      can_edit: (joinedCount ?? 0) === 0,
      requires_password: Boolean(secretCols?.access_password_hash),
      promotion: activePromo ?? null,
    };

    return NextResponse.json({ pool }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "pool:mutate", RATE_LIMITS.poolMutate);
    if (limited) return limited;

    const { poolId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: pool } = await supabase
      .from("pools")
      .select("id, created_by, week, status, type")
      .eq("id", poolId)
      .single();

    if (!pool || pool.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // The pool_games writes below run on the service role (client roles have no
    // INSERT/DELETE on pool_games), so every guard is enforced here. The freeze
    // count runs as admin on purpose: under RLS "Card holder only" the creator
    // would count only their OWN cards and could rewrite the slate after other
    // players had already paid in.
    const admin = createAdminClient();

    const { count: joinedCount } = await admin
      .from("parlay_cards")
      .select("*", { count: "exact", head: true })
      .eq("pool_id", poolId)
      .in("status", ["pending", "active", "completed"]);

    if ((joinedCount ?? 0) > 0) {
      return NextResponse.json(
        { error: "Pool can no longer be edited. At least one player has joined." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validatedData = updatePoolWithGamesSchema.parse(body);

    const touchesWindow = "startsAt" in validatedData || "endsAt" in validatedData;
    const touchesPassword = "password" in validatedData;
    if (!validatedData.name && !validatedData.selectedGames && !touchesWindow && !touchesPassword) {
      return NextResponse.json(
        { error: "Provide name, selectedGames, a window and/or a password to update" },
        { status: 400 }
      );
    }

    if (validatedData.name) {
      const { error: updateError } = await supabase
        .from("pools")
        .update({ name: validatedData.name })
        .eq("id", poolId);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 400 }
        );
      }
    }

    // Window and password live on columns client roles cannot write, so they
    // are set with the service role after the ownership + freeze checks above.
    if (touchesWindow || touchesPassword) {
      const patch: Record<string, unknown> = {};
      if (touchesWindow) {
        const { data: current } = await admin
          .from("pools")
          .select("starts_at, ends_at")
          .eq("id", poolId)
          .single();
        const startsAt =
          "startsAt" in validatedData ? validatedData.startsAt ?? null : (current?.starts_at as string | null);
        const endsAt =
          "endsAt" in validatedData ? validatedData.endsAt ?? null : (current?.ends_at as string | null);
        if (startsAt && endsAt) {
          const { data: platform } = await admin
            .from("platform_settings")
            .select("max_pool_duration_days")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const maxDays = Number(platform?.max_pool_duration_days ?? 7);
          const span = Date.parse(endsAt) - Date.parse(startsAt);
          if (!(span > 0) || span > maxDays * 24 * 3600_000) {
            return NextResponse.json(
              { error: `The pool window must end after it starts and last at most ${maxDays} days` },
              { status: 400 }
            );
          }
        }
        patch.starts_at = startsAt ? new Date(startsAt).toISOString() : null;
        patch.ends_at = endsAt ? new Date(endsAt).toISOString() : null;
      }
      if (touchesPassword) {
        if (validatedData.password && pool.type !== "private") {
          return NextResponse.json({ error: "Only private pools can have a password" }, { status: 400 });
        }
        const { hashPoolPassword } = await import("@/lib/pool-password");
        patch.access_password_hash = validatedData.password
          ? hashPoolPassword(validatedData.password)
          : null;
      }
      const { error: patchError } = await admin.from("pools").update(patch).eq("id", poolId);
      if (patchError) {
        return NextResponse.json({ error: patchError.message }, { status: 400 });
      }
    }

    if (
      validatedData.selectedGames &&
      Array.isArray(validatedData.selectedGames) &&
      validatedData.selectedGames.length > 0
    ) {
      const poolWeek = pool.week;
      const gameIds = [...new Set(validatedData.selectedGames as string[])];

      const { data: games } = await supabase
        .from("games")
        .select("id, week")
        .in("id", gameIds);

      const foundIds = new Set((games ?? []).map((g: GameWeekRow) => g.id));
      const missing = gameIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `These games are not in the database: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "..." : ""}. Sync games first.` },
          { status: 400 }
        );
      }

      const weeks = [...new Set((games ?? []).map((g: GameWeekRow) => g.week).filter(Boolean))];
      if (weeks.length > 1) {
        return NextResponse.json(
          { error: `All games must be from the same week. Found weeks: ${weeks.join(", ")}` },
          { status: 400 }
        );
      }
      if (weeks.length === 1 && weeks[0] !== poolWeek) {
        return NextResponse.json(
          { error: `All games must be from week ${poolWeek}` },
          { status: 400 }
        );
      }

      const { error: deleteError } = await admin
        .from("pool_games")
        .delete()
        .eq("pool_id", poolId);

      if (deleteError) {
        return NextResponse.json(
          { error: deleteError.message },
          { status: 400 }
        );
      }

      const poolGames = gameIds.map((game_id) => ({
        pool_id: poolId,
        game_id,
      }));

      const { error: insertError } = await admin
        .from("pool_games")
        .insert(poolGames);

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 400 }
        );
      }
    } else if (
      validatedData.selectedGames &&
      Array.isArray(validatedData.selectedGames) &&
      validatedData.selectedGames.length === 0
    ) {
      const { error: deleteError } = await admin
        .from("pool_games")
        .delete()
        .eq("pool_id", poolId);

      if (deleteError) {
        return NextResponse.json(
          { error: deleteError.message },
          { status: 400 }
        );
      }
    }

    const { data: updatedPool, error: fetchError } = await supabase
      .from("pools")
      .select(poolDetailSelect)
      .eq("id", poolId)
      .single();

    if (fetchError || !updatedPool) {
      return NextResponse.json({ pool: { id: poolId } }, { status: 200 });
    }

    const financials = await getPoolFinancials(supabase, poolId);
    const result = {
      ...updatedPool,
      prize_pot: financials.prize_pot,
      participants: financials.paid_participant_count,
      can_edit: true,
    };

    return NextResponse.json({ pool: result }, { status: 200 });
  } catch (error) {
    const thrown = error as { name?: unknown; errors?: unknown } | null | undefined;
    if (thrown?.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation error", details: thrown.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "pool:mutate", RATE_LIMITS.poolMutate);
    if (limited) return limited;

    const { poolId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: pool } = await supabase
      .from("pools")
      .select("created_by")
      .eq("id", poolId)
      .single();

    if (!pool || pool.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Client roles have no DELETE on pools, so this runs on the service role.
    // Ownership is verified above; the freeze below stops a creator deleting a
    // pool players have already paid into (which would orphan their cards and
    // money). RLS used to make this delete a silent no-op — there is no DELETE
    // policy on pools — so the guard has to live here now that the write really
    // executes.
    const admin = createAdminClient();

    const { count: joinedCount } = await admin
      .from("parlay_cards")
      .select("*", { count: "exact", head: true })
      .eq("pool_id", poolId)
      .in("status", ["pending", "active", "completed"]);

    if ((joinedCount ?? 0) > 0) {
      return NextResponse.json(
        { error: "Pool can no longer be deleted. At least one player has joined." },
        { status: 400 }
      );
    }

    const { error } = await admin.from("pools").delete().eq("id", poolId);

    if (error) {
      logDbError("pools:detail", error);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: "Pool deleted successfully" },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
