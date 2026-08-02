/**
 * Mock NFL scoreboard endpoint. Same URL shape as ESPN: /scoreboard?dates=...&seasontype=2&week=...
 * Use by setting NFL_SCOREBOARD_BASE_URL=http://localhost:3000/api/nfl in .env (or your app URL).
 */

import { NextResponse } from "next/server";
import type { ESPNScoreboardResponse } from "@/lib/types";
import { getMockNflScoreboardResponse, MOCK_NFL_SEASON_YEAR } from "@/lib/mock-nfl-games";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekParam = searchParams.get("week");
    const week = weekParam ? parseInt(weekParam, 10) : undefined;

    const data: ESPNScoreboardResponse = getMockNflScoreboardResponse(
      week ?? undefined,
      MOCK_NFL_SEASON_YEAR
    );

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("Error in mock NFL scoreboard:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch mock NFL scoreboard",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
