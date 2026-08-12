import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { logEvent } from "@/lib/log";

/**
 * Subject access / data portability — GDPR Art. 15 and 20, CCPA "right to
 * know".
 *
 * Returns everything the platform holds about the caller, in a machine-readable
 * form, as a download.
 *
 * The read runs through the service-role client deliberately. The caller's own
 * client would be subject to RLS, which is correct for ordinary reads but wrong
 * here: several tables (compliance_events, admin_audit_log entries about them)
 * are admin-only by policy, yet the subject has a statutory right to their
 * contents. The user id is taken from the verified session and every query is
 * pinned to it, so the elevated client can only ever return the caller's own
 * rows.
 */

export async function GET(request: Request) {
  try {
    const limited = await enforceRateLimit(request, "me:data-export", RATE_LIMITS.dataExport);
    if (limited) return limited;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const uid = user.id;

    const [
      profile,
      compliance,
      transactions,
      poolTransactions,
      cards,
      payoutRequests,
      payoutAccount,
      complianceEvents,
      notifications,
    ] = await Promise.all([
      admin.from("users").select("id, email, name, avatar, role, balance, created_at, updated_at").eq("id", uid).maybeSingle(),
      admin.from("user_compliance").select("*").eq("user_id", uid).maybeSingle(),
      admin.from("user_transactions").select("*").eq("user_id", uid),
      admin.from("pool_transactions").select("*").eq("user_id", uid),
      admin.from("parlay_cards").select("*").eq("user_id", uid),
      admin.from("payout_requests").select("*").eq("user_id", uid),
      admin.from("user_payout_accounts").select("*").eq("user_id", uid),
      admin.from("compliance_events").select("*").eq("user_id", uid),
      admin.from("notifications").select("*").eq("user_id", uid),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      subject: { id: uid, email: user.email },
      notice:
        "This export contains all personal data held by the platform about you. " +
        "Financial records are retained for the period required by law even after " +
        "account deletion; see the Privacy Policy.",
      data: {
        profile: profile.data ?? null,
        compliance: compliance.data ?? null,
        balanceTransactions: transactions.data ?? [],
        entryPayments: poolTransactions.data ?? [],
        parlayCards: cards.data ?? [],
        payoutRequests: payoutRequests.data ?? [],
        payoutAccount: payoutAccount.data ?? null,
        complianceDecisions: complianceEvents.data ?? [],
        notifications: notifications.data ?? [],
      },
    };

    logEvent("info", "gdpr.data_export", { userId: uid });

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="sportspool-data-export-${uid}.json"`,
        // A subject access response is personal data by definition.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not produce your data export" }, { status: 500 });
  }
}
