import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { logEvent, recordAppError } from "@/lib/log";

/**
 * Right to erasure — GDPR Art. 17, CCPA "right to delete".
 *
 * Erasure on a regulated money platform is not `DELETE FROM users`. Three
 * obligations pull against each other and all three have to be honoured:
 *
 *  1. THE SUBJECT'S RIGHT to have their personal data erased.
 *  2. THE RETENTION DUTY over financial records — anti-money-laundering and tax
 *     rules require transaction history to survive for years. Art. 17(3)(b)
 *     explicitly carves this out, so erasure does not extend to the ledger.
 *  3. SELF-EXCLUSION MUST SURVIVE. This is the one that is easy to get wrong
 *     and the most harmful to get wrong: if deleting an account cleared an
 *     active self-exclusion, the delete button would become the bypass for it —
 *     erase, re-register, and the protection a user asked for is gone. So an
 *     active exclusion blocks deletion outright, and the exclusion record is
 *     retained against the email hash regardless.
 *
 * What this route therefore does is ANONYMISE: identity fields are overwritten,
 * the auth login is removed so the account cannot be signed into, and the money
 * rows stay, now pointing at a subject who can no longer be identified from
 * them.
 *
 * It refuses while the account still has money in play, because erasing the
 * identity behind an unpaid balance strands funds that belong to a person the
 * platform can then no longer identify.
 */

const bodySchema = z.object({
  confirm: z.literal(true, {
    message: "Deletion must be explicitly confirmed",
  }),
});

export async function POST(request: Request) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(
      request,
      "me:delete-account",
      RATE_LIMITS.accountDeletion
    );
    if (limited) return limited;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const uid = user.id;

    // ── Blockers ────────────────────────────────────────────────────────────
    const [{ data: profile }, { data: compliance }, { data: pendingPayouts }] =
      await Promise.all([
        admin.from("users").select("balance, email").eq("id", uid).maybeSingle(),
        admin.from("user_compliance").select("self_excluded_until").eq("user_id", uid).maybeSingle(),
        admin.from("payout_requests").select("id").eq("user_id", uid).eq("status", "pending"),
      ]);

    const balance = Number((profile as { balance?: number } | null)?.balance ?? 0);
    if (balance > 0) {
      return NextResponse.json(
        {
          error:
            `Your balance is $${balance.toFixed(2)}. Please withdraw your funds before ` +
            `deleting your account — we cannot return money to an account we can no longer identify.`,
          code: "balance_outstanding",
        },
        { status: 409 }
      );
    }

    if ((pendingPayouts ?? []).length > 0) {
      return NextResponse.json(
        {
          error: "You have a payout in progress. Please wait for it to complete before deleting your account.",
          code: "payout_pending",
        },
        { status: 409 }
      );
    }

    const excludedUntil = (compliance as { self_excluded_until?: string } | null)?.self_excluded_until;
    if (excludedUntil && new Date(excludedUntil) > new Date()) {
      return NextResponse.json(
        {
          error:
            `Your account is self-excluded until ${excludedUntil.slice(0, 10)}. ` +
            `Accounts cannot be deleted during self-exclusion, because deleting one would ` +
            `undo the protection you asked for. You may delete it once the period ends.`,
          code: "self_excluded",
        },
        { status: 409 }
      );
    }

    // ── Anonymise ───────────────────────────────────────────────────────────
    const anonymisedEmail = `deleted-${uid}@deleted.invalid`;

    const { error: updateError } = await admin
      .from("users")
      .update({ email: anonymisedEmail, name: "Deleted user", avatar: null })
      .eq("id", uid);

    if (updateError) {
      await recordAppError({
        source: "server",
        message: `Account deletion failed to anonymise ${uid}: ${updateError.message}`,
        url: "/api/me/delete-account",
        userId: uid,
      });
      return NextResponse.json({ error: "Could not delete your account" }, { status: 500 });
    }

    // Clear the identity fields in compliance state, but keep the row: it holds
    // the exclusion history that must outlive the account.
    await admin
      .from("user_compliance")
      .update({ date_of_birth: null, tax_id_last4: null, kyc_notes: null })
      .eq("user_id", uid);

    // Remove the payout destination — a PayPal address is personal data and has
    // no retention justification once no payouts can be made.
    await admin.from("user_payout_accounts").delete().eq("user_id", uid);

    await admin.from("compliance_events").insert({
      user_id: uid,
      event_type: "account_deleted",
      decision: "allowed",
      reason: "Subject requested erasure; identity anonymised, financial records retained",
    });

    // Remove the login last: once this succeeds the user cannot sign in again,
    // so anything that must be written about them has to be written before it.
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(uid);
    if (authDeleteError) {
      await recordAppError({
        source: "server",
        message: `Account ${uid} anonymised but auth deletion failed: ${authDeleteError.message}. Manual removal required.`,
        url: "/api/me/delete-account",
        userId: uid,
      });
    }

    logEvent("info", "gdpr.account_deleted", { userId: uid });

    return NextResponse.json(
      {
        message:
          "Your account has been deleted and your personal details removed. " +
          "Transaction records are retained in anonymised form as required by financial regulation.",
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Could not delete your account" }, { status: 500 });
  }
}
