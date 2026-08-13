import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/log";

/**
 * Health and readiness probe.
 *
 * WHY. Nothing previously detected that the site was down or that a dependency
 * had failed — the audit's OPS-3/9.E gap. An uptime probe needs a URL that is
 * cheap, unauthenticated, and answers with a STATUS CODE rather than prose, so
 * that any monitor (Better Stack, Pingdom, UptimeRobot, a Vercel log drain, or
 * a plain curl in cron) can watch it without credentials.
 *
 * TWO AUDIENCES, TWO RESPONSE SHAPES. A public health endpoint is also a
 * reconnaissance surface: "which of your dependencies is down, and what are
 * they" is exactly what an attacker wants during an outage. So:
 *
 *   - Without a secret: a minimal {status} body and the right status code.
 *     200 when serving, 503 when a hard dependency is broken. Nothing about
 *     WHICH component failed, or what this app is built from.
 *
 *   - With `Authorization: Bearer $CRON_SECRET`: the full component breakdown,
 *     for an operator debugging the alert that just fired.
 *
 * HARD vs SOFT. Only failures that mean "this instance cannot correctly serve
 * requests" return 503, because a 503 pages a human. The database is hard: with
 * it down nothing works. Degraded-but-serving conditions — notably the
 * in-memory rate-limit fallback when Upstash is unprovisioned (OPS-3) — report
 * as "degraded" with a 200. They are real problems and the operator must see
 * them, but waking someone at 3am for a config gap that has been true for weeks
 * trains them to ignore the pager.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ComponentStatus = "ok" | "degraded" | "down";

interface Component {
  status: ComponentStatus;
  /** Operator-facing detail. Never returned on the unauthenticated response. */
  detail?: string;
  /** True when this component failing means the instance cannot serve. */
  hard: boolean;
}

function secretMatches(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const supplied = bearer || (request.headers.get("x-cron-secret")?.trim() ?? "");
  if (!supplied) return false;

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Cheapest query that proves the connection works AND that RLS/grants are
 * intact enough to read. A HEAD count on a tiny table touches no user data.
 */
async function checkDatabase(): Promise<Component> {
  const started = Date.now();
  try {
    const { error } = await createAdminClient()
      .from("compliance_settings")
      .select("id", { count: "exact", head: true });

    if (error) {
      return { status: "down", hard: true, detail: `query failed: ${error.message}` };
    }
    const ms = Date.now() - started;
    // A reachable but very slow database is a real signal, not an outage.
    if (ms > 3000) {
      return { status: "degraded", hard: true, detail: `slow response: ${ms}ms` };
    }
    return { status: "ok", hard: true, detail: `${ms}ms` };
  } catch (err) {
    return {
      status: "down",
      hard: true,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Config presence only — never the values, and never a network call to the
 * processor. A probe that hits Stripe on every poll would burn quota and make
 * our uptime a function of theirs.
 */
function checkConfig(): Component {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_APP_URL",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "CRON_SECRET",
  ];
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    return { status: "down", hard: true, detail: `missing env: ${missing.join(", ")}` };
  }
  return { status: "ok", hard: true };
}

/**
 * OPS-3 made visible. The limiter works either way, so this is never hard —
 * but an operator who has forgotten to provision Upstash should be able to see
 * that from the health endpoint instead of from a credential-stuffing incident.
 */
function checkRateLimitBackend(): Component {
  const configured =
    Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim()) &&
    Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim());

  if (configured) return { status: "ok", hard: false, detail: "upstash (distributed)" };

  return {
    status: "degraded",
    hard: false,
    detail:
      "in-memory fallback — limits are PER INSTANCE, not global. " +
      "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
  };
}

/** Payouts fail closed rather than paying from sandbox, so a gap here matters. */
function checkPayouts(): Component {
  const mode = process.env.PAYPAL_MODE?.trim().toLowerCase();
  const hasCreds =
    Boolean(process.env.PAYPAL_CLIENT_ID?.trim()) &&
    Boolean(process.env.PAYPAL_CLIENT_SECRET?.trim());

  if (!hasCreds) {
    return { status: "degraded", hard: false, detail: "PayPal credentials unset — payouts disabled" };
  }
  if (mode !== "live" && process.env.NODE_ENV === "production") {
    return {
      status: "degraded",
      hard: false,
      detail: `PAYPAL_MODE is "${mode ?? "unset"}" in production — payouts run against sandbox`,
    };
  }
  return { status: "ok", hard: false, detail: mode ?? "unset" };
}

export async function GET(request: Request) {
  const components: Record<string, Component> = {
    config: checkConfig(),
    database: await checkDatabase(),
    rateLimiting: checkRateLimitBackend(),
    payouts: checkPayouts(),
  };

  const hardDown = Object.values(components).some((c) => c.hard && c.status === "down");
  const anyDegraded = Object.values(components).some((c) => c.status !== "ok");

  const status: ComponentStatus = hardDown ? "down" : anyDegraded ? "degraded" : "ok";
  const httpStatus = hardDown ? 503 : 200;

  if (hardDown) {
    logEvent("error", "health.unhealthy", {
      failed: Object.entries(components)
        .filter(([, c]) => c.hard && c.status === "down")
        .map(([name]) => name),
    });
  }

  // Never cached: a cached health check reports the past.
  const headers = { "Cache-Control": "no-store, max-age=0" };

  if (!secretMatches(request)) {
    return NextResponse.json({ status }, { status: httpStatus, headers });
  }

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      components,
    },
    { status: httpStatus, headers }
  );
}
