import { NextResponse } from "next/server";
import { requireSecret } from "@/lib/require-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/log";

/**
 * The pager.
 *
 * WHY. The previous cycle built the detection layer — app_errors captures
 * server money-path failures, client crashes and reconciliation mismatches —
 * but nothing WATCHED it. An error sink nobody reads is a log file, not an
 * alert. The audit lists this as blocking (9.A: "point an alert at app_errors"),
 * and names three acceptable shapes: a scheduled query, a log drain, or a
 * Sentry-class service. This is the scheduled query, chosen because it needs no
 * third-party account and no per-seat cost to start working.
 *
 * DESIGN NOTES.
 *
 * Window, not cursor. The job reports errors in a fixed look-back window with a
 * small overlap, rather than tracking which rows it has already sent. That
 * deliberately trades a possible repeated line at a window boundary for needing
 * no schema change and no state of its own — and a digest that occasionally
 * repeats is a far better failure than one that silently skips. Missing an
 * alert is the failure that matters.
 *
 * Scheduled from GitHub Actions, not vercel.json. This project is on the Vercel
 * Hobby plan, where a sub-daily cron expression does not degrade gracefully —
 * Vercel refuses to create the deployment at all. Alerting every two hours is
 * the whole point of the job, so the schedule lives in
 * .github/workflows/alert.yml, matching the pattern settle-pools.yml already
 * uses. See scripts/check-vercel-crons.ts for the guard that enforces this.
 *
 * Digest, not per-row. One message summarising the window, grouped by source
 * and normalised message. A render loop on one client can produce hundreds of
 * near-identical rows; a per-row pager would be self-DoSing and would train the
 * operator to mute the channel, which is the same as having no alert.
 *
 * Fails LOUD, not closed. If the webhook is unset or the POST fails, the run
 * still logs the digest as a structured error line so the information survives
 * in the Vercel log stream. Alerting must never be the thing that hides an
 * error, and it must never take down the schedule it runs on.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * MUST stay >= the caller's interval, or errors fall between windows unseen.
 *
 * Paired with the every-2-hours schedule in .github/workflows/alert.yml: 120
 * minutes plus 5 of overlap, so a row landing on a boundary is reported twice
 * rather than never. Change one of these two and you must change the other.
 *
 * The schedule lives in Actions rather than vercel.json because this project is
 * on the Vercel Hobby plan, where a sub-daily cron expression makes Vercel
 * refuse the deployment outright. See scripts/check-vercel-crons.ts.
 */
const LOOKBACK_MINUTES = 125;

/** Cap the rows pulled — an incident must not turn the pager into a firehose. */
const MAX_ROWS = 500;

interface ErrorRow {
  source: string | null;
  message: string | null;
  url: string | null;
  created_at: string;
}

/**
 * Collapse the varying parts of a message so near-identical failures group.
 * UUIDs, numbers and quoted fragments are the usual culprits.
 */
function normalise(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b\d+\b/g, "<n>")
    .slice(0, 200);
}

export async function GET(request: Request) {
  const denied = requireSecret(request, "CRON_SECRET");
  if (denied) return denied;

  const since = new Date(Date.now() - LOOKBACK_MINUTES * 60_000);

  const { data, error } = await createAdminClient()
    .from("app_errors")
    .select("source, message, url, created_at")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    // The watcher itself is broken — that is its own alertable condition.
    logEvent("error", "alert.query_failed", { reason: error.message });
    return NextResponse.json({ error: "Could not read app_errors" }, { status: 500 });
  }

  const rows = (data ?? []) as ErrorRow[];

  if (rows.length === 0) {
    logEvent("info", "alert.clean", { windowMinutes: LOOKBACK_MINUTES });
    return NextResponse.json({ ok: true, errors: 0, alerted: false });
  }

  // Group by source + normalised message.
  const groups = new Map<string, { source: string; sample: string; count: number; url: string | null }>();
  for (const row of rows) {
    const source = row.source ?? "unknown";
    const message = row.message ?? "(no message)";
    const key = `${source}::${normalise(message)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { source, sample: message.slice(0, 300), count: 1, url: row.url });
    }
  }

  const ordered = [...groups.values()].sort((a, b) => b.count - a.count);
  const truncated = rows.length >= MAX_ROWS;

  const summary =
    `${rows.length}${truncated ? "+" : ""} error(s) in the last ${LOOKBACK_MINUTES}m ` +
    `across ${ordered.length} distinct issue(s)`;

  const lines = ordered
    .slice(0, 10)
    .map((g) => `• [${g.source}] x${g.count} — ${g.sample}${g.url ? ` (${g.url})` : ""}`);

  if (ordered.length > 10) {
    lines.push(`• …and ${ordered.length - 10} more distinct issue(s)`);
  }

  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
  const text = `🚨 *Gridiron alert* (${environment})\n${summary}\n${lines.join("\n")}`;

  // Always log the digest, whether or not a webhook is configured. This is the
  // line that survives if the webhook is wrong, and it is JSON so a log-based
  // alert can key off it too.
  logEvent("error", "alert.digest", {
    environment,
    windowMinutes: LOOKBACK_MINUTES,
    totalErrors: rows.length,
    distinctIssues: ordered.length,
    truncated,
    top: ordered.slice(0, 10).map((g) => ({ source: g.source, count: g.count, sample: g.sample })),
  });

  const webhook = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!webhook) {
    return NextResponse.json({
      ok: true,
      errors: rows.length,
      distinct: ordered.length,
      alerted: false,
      reason: "ALERT_WEBHOOK_URL is not set — digest written to logs only",
    });
  }

  // `text` is the Slack/Discord/Mattermost convention; the full structure is
  // included alongside it so a generic JSON consumer gets the detail too.
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        environment,
        summary,
        totalErrors: rows.length,
        distinctIssues: ordered.length,
        issues: ordered.slice(0, 10),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logEvent("error", "alert.webhook_rejected", { status: res.status });
      return NextResponse.json(
        { ok: true, errors: rows.length, alerted: false, reason: `webhook returned ${res.status}` },
        { status: 200 }
      );
    }
  } catch (err) {
    logEvent("error", "alert.webhook_failed", {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: true, errors: rows.length, alerted: false, reason: "webhook request failed" },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    errors: rows.length,
    distinct: ordered.length,
    alerted: true,
  });
}
