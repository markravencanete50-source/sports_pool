import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/log";
import { resolveRedisCreds } from "@/lib/rate-limit";

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
  // Unprovisioned is not unreachable. Without the service-role key this probe
  // cannot run at all, and reporting that as a database outage would blame the
  // wrong component — the operator would go looking at Supabase when the fix is
  // an environment variable. checkCapabilities() already names it.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return {
      status: "degraded",
      hard: false,
      detail: "not probed — SUPABASE_SERVICE_ROLE_KEY unset",
    };
  }

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
 *
 * UNPROVISIONED IS NOT DOWN. This distinction is the whole point of splitting
 * the list. This project is handed to a client who holds the real Stripe and
 * PayPal accounts, so there is a legitimate window — possibly a long one — where
 * the app is deployed and serving correctly with those credentials absent.
 *
 * Treating that as 503 would mean an uptime monitor screaming continuously
 * through the entire handover, and a pager that cries wolf for weeks is one
 * nobody reads on the day it matters. So:
 *
 *   CORE      — without these the app cannot render or authenticate at all.
 *               Their absence really is "this instance cannot serve": 503.
 *   CAPABILITY— the site serves fine, but a specific capability is switched
 *               off. Reported as degraded with the consequence spelled out, at
 *               HTTP 200. Severe, visible, and named — but not an outage.
 *
 * Nothing is hidden by this: a degraded status is never "ok", the component
 * breakdown names each missing variable and what it costs, and /api/cron/alert
 * is what escalates a money-path failure. The uptime probe answers a narrower
 * question — is this thing serving?
 */
const CORE_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const;

/** Variable → what is actually broken while it is missing. */
const CAPABILITY_ENV: Record<string, string> = {
  SUPABASE_SERVICE_ROLE_KEY:
    "settlement cannot run and Stripe purchases cannot be fulfilled — a user can be charged and receive nothing",
  STRIPE_SECRET_KEY: "no checkout session can be created, so nothing can be bought",
  STRIPE_WEBHOOK_SECRET:
    "the Stripe webhook rejects every delivery with 503, so paid purchases are never fulfilled",
  CRON_SECRET: "settlement, reconciliation and the error digest all refuse to run",
};

function checkConfig(): Component {
  const missingCore = CORE_ENV.filter((k) => !process.env[k]?.trim());
  if (missingCore.length > 0) {
    return { status: "down", hard: true, detail: `missing core env: ${missingCore.join(", ")}` };
  }
  return { status: "ok", hard: true };
}

/** Money-path provisioning, reported loudly but never as an outage. */
function checkCapabilities(): Component {
  const missing = Object.keys(CAPABILITY_ENV).filter((k) => !process.env[k]?.trim());
  if (missing.length === 0) return { status: "ok", hard: false, detail: "fully provisioned" };

  return {
    status: "degraded",
    hard: false,
    detail: missing.map((k) => `${k} unset — ${CAPABILITY_ENV[k]}`).join("; "),
  };
}

/**
 * OPS-3 made visible. The limiter works either way, so this is never hard —
 * but an operator who has forgotten to provision Upstash should be able to see
 * that from the health endpoint instead of from a credential-stuffing incident.
 */
function checkRateLimitBackend(): Component {
  // Same resolver the limiter itself uses, so health can never report "ok" while
  // the limiter is actually falling back (or vice versa). Accepts both the
  // UPSTASH_ names and the KV_ names Vercel's Upstash integration injects.
  if (resolveRedisCreds()) {
    return { status: "ok", hard: false, detail: "upstash (distributed)" };
  }

  return {
    status: "degraded",
    hard: false,
    detail:
      "in-memory fallback — limits are PER INSTANCE, not global. Set " +
      "UPSTASH_REDIS_REST_URL/_TOKEN, or connect Vercel's Upstash integration " +
      "(KV_REST_API_URL/_TOKEN).",
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
    moneyPathConfig: checkCapabilities(),
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
