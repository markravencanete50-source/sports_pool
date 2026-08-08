import { createClient } from "@/lib/supabase/server";
import { getPoolFinancials } from "@/lib/pool-financials";
import { updatePoolWithGamesSchema } from "@/lib/validations";
import { computePoolWinners } from "@/lib/winners";
import { NextResponse } from "next/server";

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

    const financials = await getPoolFinancials(supabase, poolId);

    const { count: joinedCount } = await supabase
      .from("parlay_cards")
      .select("*", { count: "exact", head: true })
      .eq("pool_id", poolId)
      .in("status", ["pending", "active", "completed"]);

    const pool = {
      ...data,
      prize_pot: financials.prize_pot,
      participants: financials.paid_participant_count,
      can_edit: (joinedCount ?? 0) === 0,
    };

    return NextResponse.json({ pool }, { status: 200 });
  } catch (error) {
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
      .select("id, created_by, week, status")
      .eq("id", poolId)
      .single();

    if (!pool || pool.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { count: joinedCount } = await supabase
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

    if (!validatedData.name && !validatedData.selectedGames) {
      return NextResponse.json(
        { error: "Provide name and/or selectedGames to update" },
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

      const foundIds = new Set((games ?? []).map((g: any) => g.id));
      const missing = gameIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `These games are not in the database: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "..." : ""}. Sync games first.` },
          { status: 400 }
        );
      }

      const weeks = [...new Set((games ?? []).map((g: any) => g.week).filter(Boolean))];
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

      const { error: deleteError } = await supabase
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

      const { error: insertError } = await supabase
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
      const { error: deleteError } = await supabase
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
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
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

    const { error } = await supabase.from("pools").delete().eq("id", poolId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { message: "Pool deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
