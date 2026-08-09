import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPoolSchema } from "@/lib/validations";
import {
  attachFinancialsToPools,
  getPoolsFinancials,
} from "@/lib/pool-financials";
import { NextResponse } from "next/server";
import { PoolStatus } from "@/lib/enums";

// SECURITY: never embed `users(*)` — that table carries email, role and balance,
// and shipped with `select using (true)` RLS. This list endpoint has no auth
// check, so the over-select let an anonymous `curl /api/pools?limit=50` harvest
// the email, admin flag and cash balance of every participant and pool creator,
// paginated across the whole user base.
// Display names come from public.profiles, NOT public.users: users is locked to
// own-row SELECT, so an embedded users(...) resolves to NULL for everyone except
// the caller and every other player renders as "Unknown".
const USER_PUBLIC_COLS = "id, name, avatar";

const poolSelect = `
  *,
  pool_games(game_id, games(*)),
  pool_participants(user_id, users:profiles!pool_participants_user_id_profiles_fkey(${USER_PUBLIC_COLS})),
  created_by_user:profiles!pools_created_by_profiles_fkey(${USER_PUBLIC_COLS})
`;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || String(DEFAULT_PAGE), 10) || DEFAULT_PAGE);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));

    let query = supabase
      .from("pools")
      .select(poolSelect, { count: "exact" })
      .order("created_at", { ascending: false });

    if (type) {
      query = query.eq("type", type);
    }

    if (status === "open") {
      query = query.in("status", ["open", "active"]);
    } else if (status === "completed") {
      query = query.eq("status", "completed");
    }

    if (search.length > 0) {
      query = query.ilike("name", `%${search.replace(/%/g, "\\%")}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, count: total, error } = await query.range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rawPools = data || [];
    const poolIds = rawPools.map((p: { id: string }) => p.id);
    // get_pools_financials EXECUTE is revoked from client roles; it returns
    // per-pool aggregates this endpoint already exposes publicly.
    const financialsMap = await getPoolsFinancials(createAdminClient(), poolIds);
    const pools = attachFinancialsToPools(rawPools, financialsMap);

    return NextResponse.json(
      { pools, total: total ?? pools.length, page, limit },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const validatedData = createPoolSchema.parse(body);

    if (!validatedData.week) {
      return NextResponse.json(
        { error: "Week is required. All games must be from the same week." },
        { status: 400 }
      );
    }

    const poolWeek = validatedData.week;

    // Client roles have no INSERT/UPDATE/DELETE on pools/pool_games; those
    // writes go through the service role, which bypasses RLS — so auth,
    // ownership and column allow-listing must all be enforced in this route.
    const admin = createAdminClient();

    const { data: pool, error: poolError } = await admin
      .from("pools")
      .insert({
        name: validatedData.name,
        type: validatedData.type,
        entry_fee: validatedData.entryFee,
        max_participants: validatedData.maxParticipants,
        week: poolWeek,
        status: PoolStatus.OPEN,
        created_by: user.id,
        participants: 0,
        prize_pot: 0,
      })
      .select()
      .single();

    if (poolError || !pool) {
      console.error("Pool creation error - Supabase insert failed:", poolError);
      return NextResponse.json(
        { error: poolError?.message || "Failed to create pool" },
        { status: 400 }
      );
    }

    if (validatedData.selectedGames.length > 0) {
      const { mapESPNTeamToDB } = await import("@/lib/constants");
      const { GameStatus } = await import("@/lib/enums");
      const { getNflScoreboard } = await import("@/lib/fetch-nfl-scoreboard");
      const currentYear = new Date().getFullYear();

      // Fetch the POOL's week, not just ESPN's current week. /api/games (which
      // populates the create-pool UI) returns current + next week, so without
      // the week arg a user could select next-week games that this fetch never
      // returns — they'd fall through unstored and FK-fail the pool_games
      // insert, making the whole pool un-creatable for any non-current week.
      const espnData = await getNflScoreboard(currentYear, poolWeek);
      const allGames = espnData.events || [];

      const seasonYear = espnData.season?.year || new Date().getFullYear();

      const gamesToStore = [];
      const poolGames = [];
      const gameWeeks: number[] = [];

      for (const gameId of validatedData.selectedGames) {
        const espnGame = allGames.find(
          (g) => g.competitions?.[0]?.id === gameId
        );

        if (espnGame) {
          const competition = espnGame.competitions[0];
          const homeTeam = competition.competitors.find(
            (c) => c.homeAway === "home"
          );
          const awayTeam = competition.competitors.find(
            (c) => c.homeAway === "away"
          );

          if (homeTeam && awayTeam) {
            const homeTeamId =
              mapESPNTeamToDB(homeTeam.team.abbreviation) ||
              homeTeam.team.abbreviation;
            const awayTeamId =
              mapESPNTeamToDB(awayTeam.team.abbreviation) ||
              awayTeam.team.abbreviation;

            if (!homeTeamId || !awayTeamId) {
              console.warn(`Skipping game: teams not in DB`);
              continue;
            }
            const gameDate = new Date(competition.date);
            const gameStatus = competition.status.type.completed
              ? GameStatus.FINISHED
              : competition.status.type.description === "In Progress"
              ? GameStatus.LIVE
              : GameStatus.SCHEDULED;
            const homeScore = homeTeam.score ? parseInt(homeTeam.score) : null;
            const awayScore = awayTeam.score ? parseInt(awayTeam.score) : null;
            const odds = competition.odds?.[0]?.details || null;

            const gameWeek = espnGame.week?.number;
            const gameSeason = espnGame.season?.year || seasonYear;

            if (gameWeek) {
              gameWeeks.push(gameWeek);
            }

            if (gameWeek && gameWeek !== poolWeek) {
              await admin.from("pools").delete().eq("id", pool.id);
              return NextResponse.json(
                {
                  error: `Game week mismatch. All games must be from week ${poolWeek}. Found game from week ${gameWeek}.`,
                },
                { status: 400 }
              );
            }

            gamesToStore.push({
              id: gameId,
              home_team_id: homeTeamId,
              away_team_id: awayTeamId,
              date: gameDate.toISOString(),
              status: gameStatus,
              home_score: homeScore,
              away_score: awayScore,
              odds: odds,
              week: gameWeek || poolWeek,
              season: gameSeason,
            });

            poolGames.push({
              pool_id: pool.id,
              game_id: gameId,
            });
          }
        } else {
          poolGames.push({
            pool_id: pool.id,
            game_id: gameId,
          });
        }
      }

      if (gameWeeks.length > 0) {
        const uniqueWeeks = [...new Set(gameWeeks)];
        if (uniqueWeeks.length > 1) {
          await admin.from("pools").delete().eq("id", pool.id);
          return NextResponse.json(
            {
              error: `All games must be from the same week. Found games from weeks: ${uniqueWeeks.join(
                ", "
              )}`,
            },
            { status: 400 }
          );
        }
        if (uniqueWeeks[0] !== poolWeek) {
          await admin.from("pools").delete().eq("id", pool.id);
          return NextResponse.json(
            {
              error: `All games must be from week ${poolWeek}. Found games from week ${uniqueWeeks[0]}.`,
            },
            { status: 400 }
          );
        }
      }

      if (gamesToStore.length > 0) {
        /*
         * Reference data (teams, games) is ADMIN-ONLY at the RLS layer, and
         * rightly so — a game's final score decides who takes the pot.
         *
         * But this is an ordinary player creating a pool, so the caller's
         * session client is denied and the whole creation used to fail: the
         * games upsert errored, the pool was deleted, and the request returned
         * 400. Non-admins could not create a pool at all.
         *
         * The values written here come from the ESPN feed, never from the
         * request body, and the caller is already authenticated above. So the
         * reference-data write is escalated to the service role deliberately —
         * the same pattern the admin pool-settings route uses.
         */
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const refData = createAdminClient();

        const { getTeamRowsForGames } = await import("@/lib/teams-seed");
        const teamRows = getTeamRowsForGames(gamesToStore);
        if (teamRows.length > 0) {
          const { error: teamsError } = await refData
            .from("teams")
            .upsert(teamRows, { onConflict: "id" });
          if (teamsError) {
            console.error("Error ensuring teams exist:", teamsError);
          }
        }

        const { error: gamesError } = await refData
          .from("games")
          .upsert(gamesToStore, { onConflict: "id" });

        if (gamesError) {
          console.error("Error storing games:", gamesError);
          await admin.from("pools").delete().eq("id", pool.id);
          return NextResponse.json(
            {
              error: "Failed to add games to pool",
              details: gamesError.message,
            },
            { status: 400 }
          );
        }
      }

      if (poolGames.length > 0) {
        const { error: poolGamesError } = await admin
          .from("pool_games")
          .insert(poolGames);

        if (poolGamesError) {
          console.error(
            "Pool creation error - pool_games insert failed:",
            poolGamesError
          );
          await admin.from("pools").delete().eq("id", pool.id);
          return NextResponse.json(
            {
              error: "Failed to add games to pool",
              details: poolGamesError.message,
            },
            { status: 400 }
          );
        }
      }
    }

    const { error: participantError } = await supabase
      .from("pool_participants")
      .insert({
        pool_id: pool.id,
        user_id: user.id,
      });

    if (participantError) {
      console.error(
        "Pool creation error - pool_participants insert failed:",
        participantError
      );
      await admin.from("pools").delete().eq("id", pool.id);
      return NextResponse.json(
        {
          error: "Failed to add participant",
          details: participantError.message,
        },
        { status: 400 }
      );
    }

    if (validatedData.type === "private") {
      let invitedUserIds: string[] = validatedData.invitedFriends ?? [];
      if (validatedData.invitedEmails?.length) {
        const normalizedEmails = validatedData.invitedEmails.map((e) =>
          e.trim().toLowerCase()
        );
        // Service-role lookup: users is own-row-only under RLS, so resolving
        // invitee emails with the caller's session matched nothing and every
        // email invite was silently dropped at pool creation. Ids are used
        // internally only and never returned to the caller.
        const { createAdminClient: adminForEmails } = await import(
          "@/lib/supabase/admin"
        );
        const { data: usersByEmail } = await adminForEmails()
          .from("users")
          .select("id")
          .in("email", normalizedEmails);
        const resolvedIds = (usersByEmail ?? []).map(
          (u: { id: string }) => u.id
        );
        invitedUserIds = [
          ...new Set([...invitedUserIds, ...resolvedIds]),
        ].filter((id) => id !== user.id);
      }
      if (invitedUserIds.length > 0) {
        const invitations = invitedUserIds.map((invitedUserId) => ({
          pool_id: pool.id,
          invited_user_id: invitedUserId,
          invited_by: user.id,
          status: "pending",
        }));
        await supabase.from("pool_invitations").insert(invitations);
      }
    }

    const { data: updatedPool } = await supabase
      .from("pools")
      .select("*")
      .eq("id", pool.id)
      .single();

    return NextResponse.json({ pool: updatedPool || pool }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      console.error("Pool creation error - Validation failed:", error);
      return NextResponse.json(
        { error: "Validation error", details: error },
        { status: 400 }
      );
    }

    console.error("Pool creation error - Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
