import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Row shapes of the two queries below, per their `.select(...)` column lists.
type InvitationPool = {
  id: string;
  name: string;
  entry_fee: number;
  week: number;
  status: string;
};

type InvitationRow = {
  id: string;
  pool_id: string;
  invited_by: string;
  status: string;
  created_at: string;
  // supabase-js's select-string parser types this to-one embed as an array,
  // while PostgREST returns an object at runtime; it is passed through as-is.
  pools: InvitationPool | InvitationPool[] | null;
};

type InviterRow = { id: string; name: string | null; email: string };

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: invitations, error: invError } = await supabase
      .from("pool_invitations")
      .select(
        `
        id,
        pool_id,
        invited_by,
        status,
        created_at,
        pools (
          id,
          name,
          entry_fee,
          week,
          status
        )
      `
      )
      .eq("invited_user_id", user.id)
      .order("created_at", { ascending: false });

    if (invError) {
      return NextResponse.json(
        { error: invError.message },
        { status: 400 }
      );
    }

    const list = invitations ?? [];
    const inviterIds = [...new Set(list.map((i: InvitationRow) => i.invited_by))];
    const { data: inviters } = await supabase
      .from("users")
      .select("id, name, email")
      .in("id", inviterIds);
    const inviterMap = (inviters ?? []).reduce(
      (acc: Record<string, InviterRow>, u: InviterRow) => {
        acc[u.id] = u;
        return acc;
      },
      {}
    );

    const enriched = list.map((inv: InvitationRow) => ({
      ...inv,
      inviter: inviterMap[inv.invited_by] ?? null,
    }));

    return NextResponse.json({ invitations: enriched });
  } catch (error) {
    console.error("Get invitations error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
