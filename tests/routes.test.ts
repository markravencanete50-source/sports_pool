import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Per-route guard conformance (audit item 9.C).
 *
 * WHY THIS EXISTS. tests/lib.test.ts pins the shared guard layer — the CSRF
 * check, the rate limiter, the schemas — and proves each one works. What it
 * structurally cannot prove is that a given route actually CALLS them. A route
 * added next month with a perfect guard layer sitting unused beside it passes
 * every existing test, and the tests/e2e suite only exercises the handful of
 * routes someone remembered to list.
 *
 * So this walks all 53 route handlers and asserts the contract each one is
 * supposed to satisfy. It is static analysis rather than execution, which is a
 * deliberate trade: it cannot prove the guard is called on every code path, but
 * it needs no Supabase, no network and no fixtures, so it runs in milliseconds
 * on every commit and can never be "temporarily skipped" because the
 * environment is missing.
 *
 * THE EXEMPTION LISTS ARE THE INTERESTING PART. Every entry needs a stated
 * reason, and — the bit that keeps them honest — an exemption that is no longer
 * needed FAILS THE TEST. A list of blanket permissions that nobody revisits is
 * how a security control quietly stops applying; this one shrinks by itself as
 * routes are fixed.
 */

const API_DIR = join(process.cwd(), "src", "app", "api");
const STATE_CHANGING = ["POST", "PUT", "PATCH", "DELETE"] as const;

interface Route {
  /** URL-ish path, e.g. /api/me/payout-request */
  path: string;
  methods: string[];
  source: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

function loadRoutes(): Route[] {
  return walk(API_DIR).map((file) => {
    const source = readFileSync(file, "utf8");
    const declared = [...source.matchAll(
      /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g
    )].map((m) => m[1]);
    const assigned = [...source.matchAll(
      /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*[=:]/g
    )].map((m) => m[1]);

    return {
      path: "/" + relative(join(process.cwd(), "src", "app"), join(file, "..")).split(sep).join("/"),
      methods: [...new Set([...declared, ...assigned])],
      source,
    };
  });
}

const routes = loadRoutes();
const mutating = routes.filter((r) => r.methods.some((m) => STATE_CHANGING.includes(m as never)));

const calls = (r: Route, fn: string) => new RegExp(`\\b${fn}\\s*\\(`).test(r.source);
const hasIdentity = (r: Route) =>
  /auth\.getUser\s*\(/.test(r.source) || calls(r, "requireAdmin") || calls(r, "requireSecret");

/**
 * Cross-origin state change protection. Exempt only where a cookie-bearing
 * browser request is not the threat model.
 */
const CSRF_EXEMPT: Record<string, string> = {
  "/api/stripe/webhook":
    "Server-to-server from Stripe with no browser and no cookies. Authenticity comes from the signature check, which is strictly stronger than an Origin header.",
  "/api/seed-admin":
    "Bearer SETUP_SECRET, not cookie auth, so there is no ambient authority for a cross-origin page to borrow. Also refuses once an admin exists.",
  "/api/newsletter/subscribe":
    "Unauthenticated public form. CSRF protects against a third party spending the victim's ambient authority; an anonymous endpoint has none to spend.",
  "/api/client-errors":
    "Error-report intake. Rate-limited and zod-capped, attributes the session server-side, and writes only to app_errors — forging one costs the attacker a junk row.",
  "/api/pools/[poolId]/cards/purchase":
    "Retired: answers 410 unconditionally before reading anything.",
  "/api/pools/[poolId]/cards/[cardId]/submit":
    "Retired: answers 410 unconditionally before reading anything.",
  "/api/[...unmatched]":
    "404 catch-all. Returns a constant JSON body and touches nothing.",
};

/** Routes that legitimately serve a caller with no established identity. */
const IDENTITY_EXEMPT: Record<string, string> = {
  "/api/auth/signin":
    "This is the route that establishes identity, so it cannot demand one first. It is rate-limited instead, which is what protects it.",
  "/api/auth/signup":
    "Creates the identity, so there is none to require. Guarded by rate limiting, the age gate, the terms gate and a breached-password check.",
  "/api/auth/signout":
    "Clears whatever session was presented. There is nothing to authorise: the worst a forged call achieves is signing out someone who is already anonymous.",
  "/api/newsletter/subscribe":
    "Public marketing form with no account behind it. Rate-limited and validated; a subscription carries no authority and grants no access.",
  "/api/stripe/webhook":
    "Identity is the Stripe signature over the raw body, verified before parsing. A user session would be meaningless on a server-to-server call.",
  "/api/pools/[poolId]/cards/purchase":
    "Retired endpoint: answers 410 unconditionally and returns before reading the body, the session or the database.",
  "/api/pools/[poolId]/cards/[cardId]/submit":
    "Retired endpoint: answers 410 unconditionally and returns before reading the body, the session or the database.",
  "/api/[...unmatched]":
    "Catch-all that answers 404 with a constant body. It performs no work, so there is nothing for an identity to authorise.",
};

/** Throttling. Exempt where the caller is already trusted or externally bounded. */
const RATE_LIMIT_EXEMPT: Record<string, string> = {
  "/api/auth/signout": "Ends a session. Repeating it costs nothing and locking it could strand a user signed in.",
  "/api/pools/complete-finished": "requireAdmin + CSRF. Admins are a small set behind MFA.",
  "/api/sync/nfl-games": "requireAdmin + CSRF, and bounded by the upstream ESPN feed.",
  "/api/seed-admin": "SETUP_SECRET gated and self-disabling after the first admin.",
  "/api/stripe/webhook": "Delivery rate is Stripe's; throttling it would drop fulfilment events.",
  "/api/pools/[poolId]/cards/purchase":
    "Retired endpoint: returns 410 before touching anything, so throttling it would only add cost to a constant response.",
  "/api/pools/[poolId]/cards/[cardId]/submit":
    "Retired endpoint: returns 410 before touching anything, so throttling it would only add cost to a constant response.",
  "/api/[...unmatched]":
    "Catch-all 404 with a constant body and no database access. Rate limiting it would spend a Redis round trip to deny a typo.",
};

/** Money boundaries. Compliance must be re-checked server-side at each one. */
const MONEY_BOUNDARIES = [
  "/api/stripe/create-checkout-session",
  "/api/me/payout-request",
  "/api/me/claim-payout",
];

function report(list: Array<{ path: string; detail?: string }>): string {
  return list.map((r) => `\n  - ${r.path}${r.detail ? ` (${r.detail})` : ""}`).join("");
}

describe("per-route guard conformance", () => {
  test("the route inventory is non-trivial and every file exports a method", () => {
    assert.ok(routes.length >= 50, `expected the full API surface, found ${routes.length} route files`);
    const silent = routes.filter((r) => r.methods.length === 0);
    assert.deepEqual(
      silent.map((r) => r.path),
      [],
      `these route.ts files export no HTTP method, so either they are dead or this test's parser is blind to them:${report(silent)}`
    );
  });

  test("every state-changing route refuses a cross-origin request", () => {
    const offenders = mutating.filter((r) => !calls(r, "assertSameOrigin") && !(r.path in CSRF_EXEMPT));
    assert.deepEqual(
      offenders.map((r) => r.path),
      [],
      `these routes change state without assertSameOrigin, so a page on another origin can drive them with the victim's cookies. Add the guard, or add a justified entry to CSRF_EXEMPT:${report(offenders)}`
    );
  });

  test("every state-changing route establishes who is calling", () => {
    const offenders = mutating.filter((r) => !hasIdentity(r) && !(r.path in IDENTITY_EXEMPT));
    assert.deepEqual(
      offenders.map((r) => r.path),
      [],
      `these routes change state without auth.getUser, requireAdmin or requireSecret:${report(offenders)}`
    );
  });

  test("every state-changing route is throttled", () => {
    const offenders = mutating.filter((r) => !calls(r, "enforceRateLimit") && !(r.path in RATE_LIMIT_EXEMPT));
    assert.deepEqual(
      offenders.map((r) => r.path),
      [],
      `these routes change state with no rate limit:${report(offenders)}`
    );
  });

  test("everything under /api/admin requires an admin", () => {
    const offenders = routes.filter((r) => r.path.startsWith("/api/admin/") && !calls(r, "requireAdmin"));
    assert.deepEqual(
      offenders.map((r) => r.path),
      [],
      `admin routes that never call requireAdmin:${report(offenders)}`
    );
  });

  test("everything under /api/cron fails closed on a shared secret", () => {
    const offenders = routes.filter((r) => r.path.startsWith("/api/cron/") && !calls(r, "requireSecret"));
    assert.deepEqual(
      offenders.map((r) => r.path),
      [],
      `cron routes that never call requireSecret, so a schedule endpoint is open:${report(offenders)}`
    );
  });

  test("every money boundary re-checks compliance server-side", () => {
    // Age, jurisdiction, self-exclusion, deposit limits and KYC are enforced at
    // the boundary, not in the UI. A money route that skips assertCompliance
    // lets an excluded player spend.
    const missing = MONEY_BOUNDARIES.filter((path) => {
      const route = routes.find((r) => r.path === path);
      assert.ok(route, `${path} is listed as a money boundary but no such route exists`);
      return !calls(route, "assertCompliance");
    });
    assert.deepEqual(missing, [], `money boundaries not calling assertCompliance:${report(missing.map((p) => ({ path: p })))}`);
  });
});

describe("the exemption lists stay honest", () => {
  // Without these, a list of blanket permissions silently outlives the reasons
  // for it — which is how a control stops applying without anyone deciding.
  const listed: Array<[string, Record<string, string>, (r: Route) => boolean]> = [
    ["CSRF_EXEMPT", CSRF_EXEMPT, (r) => calls(r, "assertSameOrigin")],
    ["IDENTITY_EXEMPT", IDENTITY_EXEMPT, hasIdentity],
    ["RATE_LIMIT_EXEMPT", RATE_LIMIT_EXEMPT, (r) => calls(r, "enforceRateLimit")],
  ];

  for (const [name, list, nowGuarded] of listed) {
    test(`${name} contains no route that has since been deleted`, () => {
      const ghosts = Object.keys(list).filter((p) => !routes.some((r) => r.path === p));
      assert.deepEqual(ghosts, [], `${name} exempts routes that no longer exist; delete these entries:${report(ghosts.map((p) => ({ path: p })))}`);
    });

    test(`${name} contains no route that is now guarded anyway`, () => {
      const redundant = Object.keys(list).filter((p) => {
        const route = routes.find((r) => r.path === p);
        return route ? nowGuarded(route) : false;
      });
      assert.deepEqual(redundant, [], `${name} still exempts routes that now carry the guard. Remove the exemption so it cannot mask a later regression:${report(redundant.map((p) => ({ path: p })))}`);
    });

    test(`${name} states a reason for every entry`, () => {
      const unexplained = Object.entries(list).filter(([, reason]) => reason.trim().length < 40);
      assert.deepEqual(
        unexplained.map(([p]) => p),
        [],
        `every exemption must say why it is safe, in enough detail to be argued with:${report(unexplained.map(([p]) => ({ path: p })))}`
      );
    });
  }
});
