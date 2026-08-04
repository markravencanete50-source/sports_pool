import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Shared-secret auth for endpoints that have no user session:
 *   - scheduled jobs (cron cannot hold an admin cookie)
 *   - the one-time admin bootstrap (runs before any admin exists)
 *
 * Rules:
 *   - The secret must be configured. If it is missing we FAIL CLOSED (503),
 *     never open. An unset env var must not silently make an endpoint public.
 *   - Comparison is timing-safe.
 *   - Accepts `Authorization: Bearer <secret>` or `x-cron-secret: <secret>`.
 *     Vercel Cron sends the former automatically when CRON_SECRET is set.
 */

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so guard first.
  // Length is not itself secret enough to matter here.
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function requireSecret(
  request: Request,
  envVar: "CRON_SECRET" | "SETUP_SECRET" = "CRON_SECRET"
): NextResponse | null {
  const expected = process.env[envVar]?.trim();

  if (!expected) {
    return NextResponse.json(
      { error: `${envVar} is not configured. Endpoint disabled.` },
      { status: 503 }
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const custom = request.headers.get("x-cron-secret")?.trim() ?? "";
  const supplied = bearer || custom;

  if (!supplied || !safeEqual(supplied, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
