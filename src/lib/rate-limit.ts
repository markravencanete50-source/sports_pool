import { NextResponse } from "next/server";

/**
 * Application-level rate limiting.
 *
 * The backend previously had NO throttling anywhere, so the authentication and
 * money endpoints were open to credential stuffing, password brute-forcing and
 * request floods — the first thing a pen-tester reaches for once the logic bugs
 * are closed.
 *
 * This is a dependency-free, in-memory fixed-window limiter. It is deliberately
 * honest about its scope:
 *
 *   - On serverless (Vercel), each instance has its own memory, so a limit of N
 *     is enforced PER INSTANCE, not globally. It still meaningfully raises the
 *     cost of an attack (a single hot instance throttles a burst) and adds zero
 *     infrastructure, but it is best-effort.
 *   - For a hard, cross-instance guarantee, back the same call sites with a
 *     shared store (e.g. Upstash Redis / @upstash/ratelimit). The call sites do
 *     not change — only the implementation of `hit()` below would.
 *
 * Supabase Auth applies its own server-side limits too; this is defence in
 * depth in front of it, and the only limiter for our own custom endpoints.
 */

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();
let lastSweep = 0;

/** Best-effort client IP from the standard proxy headers. */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

export type RateLimitOptions = { limit: number; windowMs: number };

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfter: number };

/** Register one hit against `key`. Returns whether the caller is within budget. */
export function hit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();

  // Opportunistic cleanup so the map cannot grow unbounded from one-off keys.
  if (now - lastSweep > 60_000) {
    for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
    lastSweep = now;
  }

  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.limit - 1 };
  }

  if (bucket.count >= opts.limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count += 1;
  return { ok: true, remaining: opts.limit - bucket.count };
}

/**
 * Enforce a named limit keyed by client IP. Returns a ready-to-send 429
 * NextResponse when the caller is over budget, or null to proceed.
 *
 *   const limited = enforceRateLimit(request, "auth:signin", RATE_LIMITS.authSignin);
 *   if (limited) return limited;
 */
export function enforceRateLimit(
  request: Request,
  bucketName: string,
  opts: RateLimitOptions
): NextResponse | null {
  const key = `${bucketName}:${getClientIp(request)}`;
  const result = hit(key, opts);
  if (result.ok) return null;

  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(result.retryAfter) } }
  );
}

/**
 * Presets, tuned to be well clear of legitimate use while still cutting off
 * automated abuse. Windows are per client IP.
 */
export const RATE_LIMITS = {
  /** Credential stuffing / password guessing. */
  authSignin: { limit: 10, windowMs: 5 * 60_000 },
  /** Account-creation floods. */
  authSignup: { limit: 6, windowMs: 30 * 60_000 },
  /** Newsletter subscription spam. */
  newsletter: { limit: 5, windowMs: 60 * 60_000 },
  /** Withdrawal-request flooding. */
  payoutRequest: { limit: 12, windowMs: 60 * 60_000 },
  /** Payout-account churn. */
  payoutAccount: { limit: 12, windowMs: 60 * 60_000 },
  /** Checkout-session creation abuse (each call hits Stripe). */
  checkout: { limit: 30, windowMs: 60 * 60_000 },
  /** Payment confirmation polling abuse. */
  paymentConfirm: { limit: 60, windowMs: 60 * 60_000 },
} as const;
