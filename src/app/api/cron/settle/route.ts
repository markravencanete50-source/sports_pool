import { NextResponse } from "next/server";
import { requireSecret } from "@/lib/require-secret";
import { runSettlement } from "@/lib/settle-pools";

/*
 * Scheduled pool settlement.
 *
 * Vercel Cron calls this on the schedule in vercel.json. It sends
 * `Authorization: Bearer $CRON_SECRET` automatically once CRON_SECRET is set on
 * the project, which is exactly what requireSecret() checks.
 *
 * AUTH: requireSecret FAILS CLOSED. With CRON_SECRET unset the route answers
 * 503, never 200 — an unset variable must not quietly leave a money-moving
 * endpoint open to the internet. That means settlement genuinely does not run
 * until the secret is configured, which is the correct trade: no payouts is
 * recoverable, payouts triggered by an anonymous caller is not.
 *
 * GET, because Vercel Cron issues GET. It is not idempotent in the HTTP sense —
 * it moves money — so it is deliberately secret-gated rather than public.
 */

// Settlement talks to ESPN and writes balances; never serve it from cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Scoring a full slate can exceed the default budget on a busy Sunday.
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireSecret(request, "CRON_SECRET");
  if (denied) return denied;

  try {
    const report = await runSettlement();

    // Surface anything that needs a human: a completed pool with no winner is
    // holding player money. Log loudly rather than only returning it, because
    // nobody reads a cron's response body.
    if (report.warnings.length > 0) {
      console.warn("[cron/settle] warnings:", JSON.stringify(report.warnings));
    }
    const failed = report.pools.filter((p) => p.error);
    if (failed.length > 0) {
      console.error("[cron/settle] pool failures:", JSON.stringify(failed));
    }

    console.log(
      `[cron/settle] games ${report.gamesUpdated}/${report.gamesChecked} updated; ` +
        `pools ${report.poolsCompleted} completed, ${report.poolsPaid} paid, ` +
        `${report.winnersCreated} winners`
    );

    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    // A thrown settlement is an incident: pools may be completed but unpaid.
    console.error("[cron/settle] fatal:", error);
    return NextResponse.json(
      {
        error: "Settlement run failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
