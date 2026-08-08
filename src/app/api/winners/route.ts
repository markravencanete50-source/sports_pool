import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// Anonymous endpoint: never expose account identifiers or full names.
function publicDisplayName(name: unknown): string {
  if (typeof name !== "string" || name.trim().length === 0) return "Anonymous";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export async function GET(request: Request) {
  try {
    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10)
    );

    const { data: rows, error } = await admin
      .from("pool_winners")
      .select(`
        amount,
        users(name, avatar),
        pools(name)
      `)
      .order("amount", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    const winners = (rows ?? []).map((row: any, idx: number) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      const pool = Array.isArray(row.pools) ? row.pools[0] : row.pools;
      return {
        id: idx,
        name: publicDisplayName(user?.name),
        avatar: user?.avatar ?? null,
        amount: Number(row.amount),
        poolName: pool?.name ?? "",
      };
    });

    return NextResponse.json({ winners }, { status: 200 });
  } catch (error) {
    console.error("Error fetching winners:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch winners",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
