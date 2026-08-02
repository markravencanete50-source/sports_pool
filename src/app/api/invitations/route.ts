import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
    const inviterIds = [...new Set(list.map((i: any) => i.invited_by))];
    const { data: inviters } = await supabase
      .from("users")
      .select("id, name, email")
      .in("id", inviterIds);
    const inviterMap = (inviters ?? []).reduce(
      (acc: Record<string, any>, u: any) => {
        acc[u.id] = u;
        return acc;
      },
      {}
    );

    const enriched = list.map((inv: any) => ({
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
