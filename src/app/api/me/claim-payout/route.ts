import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { claimPayoutSchema } from "@/lib/validations";

/**
 * Claim an approved winning into the user's balance.
 *
 * This route used to read the balance, compute balanceAfter in JavaScript, and
 * write it back as an absolute value:
 *
 *     .from("users").update({ balance: balanceAfter }).eq("id", user.id)
 *
 * Double-crediting was already prevented by the unique index
 * idx_user_transactions_winning_per_pool. The remaining defect was a LOST
 * UPDATE: any concurrent balance change landing between the read and the write
 * was erased. An admin payout debit in that window would be wiped out, handing
 * the user their withdrawal back for free.
 *
 * The admin payout route already had this right, and says so in a comment —
 * "writing a value computed before the PayPal call would clobber any concurrent
 * change". This route never got the same treatment.
 *
 * The whole claim is now one transaction in the database, in
 * public.claim_pool_payout(): the approval row is locked with SELECT ... FOR
 * UPDATE so concurrent claims serialise, and the balance moves by
 * `balance = balance + amount` rather than by an absolute value.
 *
 * The service-role client is gone with it. The function derives the claimant
 * from auth.uid(), so identity comes from the caller's JWT rather than from a
 * user id this route looks up and passes along.
 */

type ClaimOutcome =
  | "credited"
  | "already_claimed"
  | "unauthenticated"
  | "not_winner"
  | "not_approved"
  | "no_approval"
  | "invalid_amount";

type ClaimRow = {
  outcome: ClaimOutcome;
  previous_balance: number | string | null;
  amount_credited: number | string | null;
  final_balance: number | string | null;
};

// Outcomes that are not a successful credit. Statuses and messages match what
// this route returned before, so existing clients see no change.
const FAILURES: Partial<Record<ClaimOutcome, { status: number; error: string }>> = {
  unauthenticated: { status: 401, error: "Unauthorized" },
  not_winner: { status: 403, error: "You are not the winner for this pool" },
  not_approved: { status: 400, error: "This winning has not been approved yet" },
  no_approval: { status: 404, error: "Payout approval not found" },
  already_claimed: { status: 400, error: "This payout has already been claimed" },
  invalid_amount: { status: 400, error: "Invalid amount" },
};

export async function POST(request: Request) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    // The claim itself is atomic and idempotent, so this guards load rather
    // than correctness: a money endpoint should not double as a free way to
    // hammer the database.
    const limited = await enforceRateLimit(request, "payout:claim", RATE_LIMITS.claimPayout);
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
    const parsed = claimPayoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "poolId is required" },
        { status: 400 }
      );
    }
    const { poolId } = parsed.data;

    const { data, error } = await supabase.rpc("claim_pool_payout", {
      p_pool_id: poolId,
    });

    if (error) {
      console.error("[claim-payout] claim_pool_payout failed:", error.message);
      return NextResponse.json(
        { error: "Could not claim this payout" },
        { status: 500 }
      );
    }

    const row = (Array.isArray(data) ? data[0] : data) as ClaimRow | undefined;
    if (!row) {
      console.error("[claim-payout] claim_pool_payout returned no row");
      return NextResponse.json(
        { error: "Could not claim this payout" },
        { status: 500 }
      );
    }

    const failure = FAILURES[row.outcome];
    if (failure) {
      return NextResponse.json({ error: failure.error }, { status: failure.status });
    }

    return NextResponse.json(
      {
        message: "Payout claimed and credited to your balance",
        previousBalance: Number(row.previous_balance ?? 0),
        amount: Number(row.amount_credited ?? 0),
        finalBalance: Number(row.final_balance ?? 0),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "[claim-payout] unexpected error:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
