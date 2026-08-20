import { NextResponse } from "next/server";

/**
 * Application-level rate limiting.
 *
 * The backend previously had NO throttling anywhere, so the authentication and
 * money endpoints were open to credential stuffing, password brute-forcing and
 * request floods.
 *
 * Two backends, chosen automatically:
 *
 *   1. Upstash Redis (preferred, and the right choice on serverless). When
 *      Redis REST credentials are set, limits are enforced GLOBALLY across every
 *      serverless instance via a shared store, over Upstash's HTTP REST API (no
 *      persistent TCP connection, which is exactly what Vercel functions need).
 *      Uses @upstash/ratelimit's sliding window.
 *
 *   2. In-memory fallback. When Redis is not configured — local dev, or before
 *      the env vars are provisioned — it degrades to a per-instance in-memory
 *      fixed window. Still useful, but PER INSTANCE, so treat it as best-effort.
 *
 * The fallback also catches Redis outages: if a Redis call throws, that single
 * request is limited in memory rather than failing the user's request. Rate
 * limiting is a protective control, so a store outage must not take auth or
 * checkout down with it.
 *
 * Call sites do not care which backend is active:
 *
 *   const limited = await enforceRateLimit(request, "auth:signin", RATE_LIMITS.authSignin);
 *   if (limited) return limited;
 */

// ─────────────────────────────────────────────────────────────────────────────
// In-memory fallback
// ─────────────────────────────────────────────────────────────────────────────
type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();
let lastSweep = 0;

/**
 * Client IP for rate-limit keying.
 *
 * SECURITY: the LEFTMOST X-Forwarded-For entry is supplied by the client and is
 * trivially forged — sending a random value on every request gave each one its
 * own bucket and defeated the throttle entirely, which is the one thing a
 * limiter must not allow.
 *
 * A platform edge header (Vercel's x-vercel-forwarded-for, Cloudflare's
 * cf-connecting-ip) is only trustworthy when the request ACTUALLY transited that
 * edge, because the edge overwrites it. Off that platform — a self-host reachable
 * at origin, a preview, a misrouted deployment — the very same header is fully
 * client-controlled again, so trusting it unconditionally reopened the exact
 * bypass the leftmost-XFF note above warns about: send a random
 * x-vercel-forwarded-for per request and every request lands in its own bucket.
 *
 * So each platform header is gated on an explicit signal that we sit behind that
 * platform's edge:
 *   - Vercel sets process.env.VERCEL on every deployment.
 *   - A Cloudflare-fronted self-host (see docker-compose.yml's cloudflared
 *     service) must set TRUSTED_PROXY=cloudflare so cf-connecting-ip is honoured.
 *
 * Order of preference:
 *   1. The platform header, but only when we are provably behind that platform.
 *   2. The RIGHTMOST X-Forwarded-For entry — appended by our own proxy, so it is
 *      the last hop we actually trust, unlike the leftmost which the caller
 *      controls.
 *   3. x-real-ip, then a constant.
 *
 * Falling back to a shared constant is deliberate: an unidentifiable caller
 * shares one bucket rather than getting an unlimited private one.
 */
export function getClientIp(request: Request): string {
  if (process.env.VERCEL) {
    const vercel = request.headers.get("x-vercel-forwarded-for")?.trim();
    if (vercel) return vercel;
  }
  if (process.env.TRUSTED_PROXY?.trim().toLowerCase() === "cloudflare") {
    const cf = request.headers.get("cf-connecting-ip")?.trim();
    if (cf) return cf;
  }

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    const rightmost = hops[hops.length - 1];
    if (rightmost) return rightmost;
  }

  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;

  return "unknown";
}

export type RateLimitOptions = { limit: number; windowMs: number };

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfter: number };

function hitMemory(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();

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

// ─────────────────────────────────────────────────────────────────────────────
// Upstash Redis backend (lazy, optional)
// ─────────────────────────────────────────────────────────────────────────────
//
// One Ratelimit instance per distinct (limit, window) config, cached for the
// lifetime of the instance. `any` here avoids a hard type dependency on the
// package when it is not installed; the shape used below is stable Upstash API.
const limiterCache = new Map<string, unknown>();
let upstashUnavailable = false;

/**
 * Resolve the Redis REST credentials, accepting BOTH naming conventions.
 *
 * Two ways this project can get an Upstash database, and they name the variables
 * differently:
 *
 *   - Setting UPSTASH_REDIS_REST_URL / _TOKEN by hand (the documented names).
 *   - Vercel's Upstash marketplace integration, which auto-injects KV_REST_API_URL
 *     and KV_REST_API_TOKEN (plus KV_URL, REDIS_URL, and a READ_ONLY token). This
 *     is the path a client following the runbook will actually take, and it does
 *     NOT create the UPSTASH_-prefixed names.
 *
 * Reading only the UPSTASH_ names meant a correctly-provisioned integration
 * silently fell through to the in-memory limiter — configured, connected, and
 * doing nothing. Accepting the KV_ names makes the integration work out of the
 * box. NOTE: the full-access KV_REST_API_TOKEN, never KV_REST_API_READ_ONLY_TOKEN
 * — the sliding-window limiter must INCR, which a read-only token cannot.
 */
export function resolveRedisCreds(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

async function getUpstashLimiter(
  opts: RateLimitOptions
): Promise<{ limit: (id: string) => Promise<{ success: boolean; remaining: number; reset: number }> } | null> {
  const creds = resolveRedisCreds();
  if (!creds) return null;
  const { url, token } = creds;
  if (upstashUnavailable) return null;

  const cacheKey = `${opts.limit}:${opts.windowMs}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached as never;

  try {
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import("@upstash/ratelimit"),
      import("@upstash/redis"),
    ]);
    const redis = new Redis({ url, token });
    const seconds = Math.max(1, Math.ceil(opts.windowMs / 1000));
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(opts.limit, `${seconds} s`),
      prefix: "rl",
      analytics: false,
    });
    limiterCache.set(cacheKey, limiter);
    return limiter as never;
  } catch (e) {
    // Package not installed or failed to init: stop trying and use memory.
    upstashUnavailable = true;
    console.error(
      "[rate-limit] Upstash unavailable, falling back to in-memory:",
      e instanceof Error ? e.message : String(e)
    );
    return null;
  }
}

/**
 * Register one hit against `key`. Prefers the shared Redis store; falls back to
 * in-memory when Redis is unconfigured or a call fails.
 */
export async function hit(
  key: string,
  opts: RateLimitOptions
): Promise<RateLimitResult> {
  const limiter = await getUpstashLimiter(opts);
  if (limiter) {
    try {
      const res = await limiter.limit(key);
      if (res.success) return { ok: true, remaining: res.remaining };
      const retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));
      return { ok: false, retryAfter };
    } catch (e) {
      // Transient Redis error: don't fail the request — degrade to memory.
      console.error(
        "[rate-limit] Redis limit() failed, using in-memory for this call:",
        e instanceof Error ? e.message : String(e)
      );
    }
  }
  return hitMemory(key, opts);
}

/**
 * Enforce a named limit keyed by client IP. Returns a ready-to-send 429
 * NextResponse when the caller is over budget, or null to proceed.
 *
 * NOTE: this is async — always `await` it and return the result if truthy.
 */
export async function enforceRateLimit(
  request: Request,
  bucketName: string,
  opts: RateLimitOptions
): Promise<NextResponse | null> {
  const key = `${bucketName}:${getClientIp(request)}`;
  const result = await hit(key, opts);
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
  /**
   * Display-name availability probing. This endpoint answers "does an account
   * hold this name" for any string, which is a name-enumeration oracle by
   * construction. public.profiles is already world-readable by design (chat
   * authorship, winner lists), so the names are not secret — but a
   * purpose-built checker that answers thousands of times a minute is a
   * different thing from a public list, and it costs a query each time.
   * Generous enough to type a name and see it validate as you go.
   */
  displayNameCheck: { limit: 60, windowMs: 5 * 60_000 },
  /** Profile edits. Each rename writes users and mirrors into profiles. */
  profileUpdate: { limit: 20, windowMs: 60 * 60_000 },
  /**
   * Avatar upload. Each call moves up to 2MB through the server and stores it,
   * so this bounds both bandwidth and the storage a single account can churn.
   */
  avatarUpload: { limit: 10, windowMs: 60 * 60_000 },
  /** Checkout-session creation abuse (each call hits Stripe). */
  checkout: { limit: 30, windowMs: 60 * 60_000 },
  /** Payment confirmation polling abuse. */
  paymentConfirm: { limit: 60, windowMs: 60 * 60_000 },
  /**
   * Chat posting. Every message costs an OpenAI Moderation call, so an
   * unthrottled loop burns the quota — and because moderation fails CLOSED,
   * tripping OpenAI's own 429 would block chat in every pool at once. Generous
   * for a human, fatal to a script.
   */
  chatPost: { limit: 30, windowMs: 5 * 60_000 },
  /**
   * Pool creation. Any authenticated user may create pools (the route does this
   * with the service role by design), so nothing else bounds how many a single
   * account can spawn. Unthrottled it is public-lobby spam.
   */
  poolCreate: { limit: 20, windowMs: 60 * 60_000 },
  /**
   * Pool game sync. Each call makes SERVER-SIDE requests to ESPN, so this is a
   * request amplifier: one cheap call from a client becomes outbound traffic
   * from our IP, and hammering it risks ESPN rate-limiting the whole app —
   * which is what settlement reads scores from.
   */
  gamesSync: { limit: 20, windowMs: 60 * 60_000 },
  /**
   * Payout claiming. The claim itself is atomic and idempotent, so this is not
   * guarding correctness — it stops a money endpoint from being used as a free
   * database-load generator.
   */
  claimPayout: { limit: 30, windowMs: 60 * 60_000 },
  /**
   * Admin payout completion. Each call can move real money out through PayPal.
   * The route is already idempotent per payout request, so this is not guarding
   * correctness either — it bounds how fast a stolen admin session can drain
   * the float. Set generously on purpose: throttling an admin out of paying
   * legitimate withdrawals is a worse failure than the abuse it prevents, and
   * the abuse already requires a compromised admin account.
   */
  payoutComplete: { limit: 120, windowMs: 60 * 60_000 },
  /**
   * Team roster sync. Same request-amplifier shape as gamesSync: one cheap
   * inbound call becomes outbound ESPN traffic from our IP.
   */
  teamsSync: { limit: 10, windowMs: 60 * 60_000 },
  /**
   * Sending pool invitations. Each call writes invitation rows and notifies
   * OTHER users, so unthrottled this is a spam vector pointed at your own
   * userbase rather than at the database.
   */
  inviteSend: { limit: 30, windowMs: 60 * 60_000 },
  /** Accepting or declining an invitation — state churn on someone else's pool. */
  invitationRespond: { limit: 60, windowMs: 60 * 60_000 },
  /**
   * Marking notifications read. Legitimately high volume — opening a busy
   * inbox fires one call per item — so this sits well above human use and only
   * cuts off a loop.
   */
  notificationRead: { limit: 240, windowMs: 60 * 60_000 },
  /**
   * Pick writes: the hottest authenticated path in the app. Up to 9 games x 3
   * cards, freely re-edited until kickoff, and because every bucket here is
   * keyed by client IP several users may legitimately share one (household,
   * campus, office NAT). Deliberately generous — the goal is to stop a script,
   * not a family.
   */
  cardPicks: { limit: 300, windowMs: 60 * 60_000 },
  /** Card locking — once per card in normal use. */
  cardLock: { limit: 60, windowMs: 60 * 60_000 },
  /** Pool edit/delete by its owner or an admin. */
  poolMutate: { limit: 60, windowMs: 60 * 60_000 },
  /**
   * Admin configuration writes — role changes, pool settings, manual game
   * outcomes. Few admins and low legitimate volume, but each is a lever on
   * money or privilege. Same reasoning as payoutComplete on the ceiling:
   * high enough that real admin work never trips it.
   */
  adminMutate: { limit: 120, windowMs: 60 * 60_000 },
  /**
   * Client error reports (/api/client-errors). Unauthenticated by design —
   * the reports that matter most come from broken sessions — so the limit is
   * what bounds the blast radius. A render-error loop on one client is capped
   * here; a real user hitting distinct errors never gets close.
   */
  clientError: { limit: 20, windowMs: 10 * 60_000 },
  /**
   * Responsible-gambling settings. Generous — a user adjusting limits or
   * applying a self-exclusion must never be throttled out of protecting
   * themselves — but bounded so the RPC cannot be used as a write amplifier.
   */
  responsibleGaming: { limit: 30, windowMs: 60 * 60_000 },
  /**
   * Subject access exports. Each one reads nine tables, so it is expensive;
   * a person exercising a statutory right needs it a handful of times, not
   * continuously.
   */
  dataExport: { limit: 5, windowMs: 60 * 60_000 },
  /** Account deletion. Irreversible, so a low ceiling costs nothing. */
  accountDeletion: { limit: 5, windowMs: 24 * 60 * 60_000 },
  /** Starting MFA enrolment. Cheap, but no reason to allow a flood of factors. */
  mfa: { limit: 10, windowMs: 60 * 60_000 },
  /**
   * Verifying a TOTP code. This one is a brute-force surface: six digits is a
   * million combinations, and a 30-second window means an unthrottled attacker
   * with a stolen password could grind it. Tight by design.
   */
  mfaVerify: { limit: 8, windowMs: 15 * 60_000 },
} as const;
