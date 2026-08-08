import { createClient } from "@/lib/supabase/server";
import { submitPickSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ poolId: string; cardId: string }> }
) {
  try {
    const { poolId, cardId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = submitPickSchema.parse({
      ...body,
      poolId,
      gameId: cardId,
    });

    let teamId = validatedData.teamId;
    if (!teamId && validatedData.prediction) {
      const { data: game } = await supabase
        .from("games")
        .select("home_team_id, away_team_id")
        .eq("id", validatedData.gameId)
        .single();

      if (game) {
        if (validatedData.prediction === "home_win") {
          teamId = game.home_team_id;
        } else if (validatedData.prediction === "away_win") {
          teamId = game.away_team_id;
        }
      }
    }

    const { data: participant } = await supabase
      .from("pool_participants")
      .select("id")
      .eq("pool_id", poolId)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: "You must join the pool first" },
        { status: 403 }
      );
    }

    /*
     * SECURITY — per-game kickoff lock (defence in depth).
     *
     * This legacy endpoint writes to the `picks` table, which settlement does
     * not read, so it cannot decide money today. But an unlocked write path is
     * a latent guaranteed-win primitive the moment anything starts scoring off
     * this table, so it enforces the same rule as the parlay path: a pick is
     * accepted only while its game is still scheduled and its kickoff is in the
     * future.
     */
    const { data: lockGame } = await supabase
      .from("games")
      .select("id, date, status")
      .eq("id", validatedData.gameId)
      .maybeSingle();

    if (!lockGame) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const kickoff = new Date(lockGame.date).getTime();
    if (!Number.isFinite(kickoff)) {
      return NextResponse.json(
        { error: "Game has no valid kickoff time" },
        { status: 409 }
      );
    }

    if (lockGame.status !== "scheduled" || kickoff <= Date.now()) {
      return NextResponse.json(
        { error: "Picks are locked for this game — it has already started" },
        { status: 409 }
      );
    }

    const { data: existingPick } = await supabase
      .from("picks")
      .select("id")
      .eq("pool_id", poolId)
      .eq("user_id", user.id)
      .eq("game_id", validatedData.gameId)
      .single();

    if (existingPick) {
      const updateData: any = {};
      if (teamId) updateData.team_id = teamId;
      if (validatedData.prediction) updateData.prediction = validatedData.prediction;
      if (validatedData.totalScorePrediction !== undefined) {
        updateData.total_score_prediction = validatedData.totalScorePrediction;
      }

      const { data, error } = await supabase
        .from("picks")
        .update(updateData)
        .eq("id", existingPick.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }

      return NextResponse.json({ pick: data }, { status: 200 });
    } else {
      const insertData: any = {
        pool_id: validatedData.poolId,
        user_id: user.id,
        game_id: validatedData.gameId,
      };
      if (teamId) insertData.team_id = teamId;
      if (validatedData.prediction) insertData.prediction = validatedData.prediction;
      if (validatedData.totalScorePrediction !== undefined) {
        insertData.total_score_prediction = validatedData.totalScorePrediction;
      }

      const { data, error } = await supabase
        .from("picks")
        .insert(insertData)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }

      return NextResponse.json({ pick: data }, { status: 201 });
    }
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
