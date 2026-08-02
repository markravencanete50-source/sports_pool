import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { fetchNflTeamsFromApi } from "@/lib/fetch-nfl-teams";
import { TEAM_MAP } from "@/lib/constants";
import { getTeamRowsForAbbrevs } from "@/lib/teams-seed";

export async function POST() {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (auth instanceof NextResponse) return auth;

    let rows: { id: string; name: string; city: string; abbreviation: string; logo: string; primary_color: string; secondary_color: string }[];
    try {
      rows = await fetchNflTeamsFromApi();
    } catch (err) {
      const fallbackIds = Object.keys(TEAM_MAP) as string[];
      rows = getTeamRowsForAbbrevs(fallbackIds);
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No teams to sync" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { error } = await admin.from("teams").upsert(rows, { onConflict: "id" });
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Teams synced", count: rows.length },
      { status: 200 }
    );
  } catch (error) {
    console.error("Sync teams error:", error);
    return NextResponse.json(
      {
        error: "Failed to sync teams",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
