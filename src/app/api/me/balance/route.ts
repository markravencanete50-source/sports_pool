import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error } = await supabase
      .from("users")
      .select("balance")
      .eq("id", user.id)
      .single();

    if (error || !profile) {
      return NextResponse.json(
        { error: error?.message ?? "User not found" },
        { status: 400 }
      );
    }

    const balance = Number(profile.balance ?? 0);

    const { searchParams } = new URL(request.url);
    const includeTransactions = searchParams.get("transactions") === "true";
    let transactions: unknown[] = [];

    let pendingClaims: {
      pool_id: string;
      pool_name: string;
      amount: number;
    }[] = [];

    if (includeTransactions) {
      const { data: txData } = await supabase
        .from("user_transactions")
        .select(
          "id, admin_id, previous_balance, amount, final_balance, type, reference_type, created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      transactions = (txData ?? []).map((t) => ({
        ...t,
        previous_balance: Number(t.previous_balance),
        amount: Number(t.amount),
        final_balance: Number(t.final_balance),
      }));

      const { data: approvals } = await supabase
        .from("payout_approvals")
        .select("pool_id, amount, pools(name)")
        .eq("user_id", user.id)
        .eq("status", "pending_claim");
      pendingClaims = (approvals ?? []).map((a) => {
        const pools = a.pools as { name?: string }[] | { name?: string } | null;
        const pool = Array.isArray(pools) ? pools[0] : pools;
        return {
          pool_id: a.pool_id,
          pool_name: pool?.name ?? "Pool",
          amount: Number(a.amount),
        };
      });
    }

    return NextResponse.json(
      {
        balance,
        ...(includeTransactions ? { transactions, pendingClaims } : {}),
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
