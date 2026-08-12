import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Structured logging + durable error capture.
 *
 * Two layers, used together on the paths where a silent failure costs money:
 *
 *  1. logEvent() — one JSON object per line to stdout/stderr. Vercel keeps
 *     these; JSON means they are searchable and can drive log-based alerts
 *     later without re-instrumenting call sites.
 *
 *  2. recordAppError() — best-effort insert into public.app_errors, which is
 *     service-role-only (no RLS policies, no client grants). This is what an
 *     operator actually queries after the fact: a failed webhook fulfilment,
 *     a rejected PayPal batch, a client-side render crash.
 *
 * recordAppError NEVER throws and is fire-and-forget by design: error
 * reporting must not take down the request that was already failing, and a
 * database outage must not recurse into itself.
 */

type LogLevel = "info" | "warn" | "error";

export function logEvent(
  level: LogLevel,
  event: string,
  context: Record<string, unknown> = {}
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...context,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export async function recordAppError(input: {
  source: "client" | "server";
  message: string;
  digest?: string | null;
  url?: string | null;
  userAgent?: string | null;
  userId?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    // Truncation mirrors the CHECK constraints on app_errors so an oversized
    // message degrades to a clipped row instead of a rejected insert.
    const { error } = await admin.from("app_errors").insert({
      source: input.source,
      message: input.message.slice(0, 2000),
      digest: input.digest?.slice(0, 100) ?? null,
      url: input.url?.slice(0, 500) ?? null,
      user_agent: input.userAgent?.slice(0, 400) ?? null,
      user_id: input.userId ?? null,
    });
    if (error) {
      logEvent("warn", "app_errors.insert_failed", { reason: error.message });
    }
  } catch (err) {
    logEvent("warn", "app_errors.insert_threw", {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}
