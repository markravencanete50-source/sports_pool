import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { MINIMUM_PAYOUT_AMOUNT } from "@/lib/constants";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-guards";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("payout_requests")
      .select("id, pool_id, status, amount, created_at, processed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ payoutRequests: data || [] }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "payout:request", RATE_LIMITS.payoutRequest);
    if (limited) return limited;

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const amountParam = body.amount;
    const amount =
      typeof amountParam === "number" ? amountParam : parseFloat(amountParam);
    if (!Number.isFinite(amount) || amount < MINIMUM_PAYOUT_AMOUNT) {
      return NextResponse.json(
        { error: `Minimum payout amount is $${MINIMUM_PAYOUT_AMOUNT}` },
        { status: 400 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("balance")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: profileError?.message ?? "User not found" },
        { status: 400 }
      );
    }

    const balance = Number(profile.balance ?? 0);
    if (balance < amount) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400 }
      );
    }

    const { data: payoutAccount } = await supabase
      .from("user_payout_accounts")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!payoutAccount) {
      return NextResponse.json(
        {
          error: "Link a payout account (e.g. PayPal) to receive payouts.",
          code: "PAYOUT_ACCOUNT_REQUIRED",
        },
        { status: 400 }
      );
    }

    const { data: payoutRequest, error } = await supabase
      .from("payout_requests")
      .insert({
        user_id: user.id,
        amount,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { payoutRequest, message: "Payout requested. Admin will process." },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
