/**
 * Unit tests for the security-relevant library layer, run by node:test via tsx
 * (npm run test:unit). No framework dependency and no network: everything
 * external (HIBP, Redis) is stubbed, so this suite can gate CI anywhere.
 *
 * Coverage picks the modules where a silent regression is a security bug:
 *   - safeInternalPath   (open-redirect clamp on the auth callback)
 *   - assertSameOrigin   (the CSRF boundary)
 *   - enforceRateLimit   (fallback limiter budget + 429 shape)
 *   - buildCsp / nonce   (the XSS mitigation header)
 *   - validations        (password policy + money-route schemas)
 *   - checkPasswordBreached (HIBP parsing, padding, fail-open)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { safeInternalPath, DASHBOARD_PATH } from "../src/lib/routes";
import { assertSameOrigin } from "../src/lib/request-guards";
import { enforceRateLimit, resolveRedisCreds } from "../src/lib/rate-limit";
import { buildCsp, generateNonce } from "../src/lib/csp";
import {
  signupSchema,
  payoutAccountSchema,
  payoutRequestSchema,
  claimPayoutSchema,
  updateUserRoleSchema,
  uuidParamSchema,
} from "../src/lib/validations";
import { checkPasswordBreached } from "../src/lib/password-breach";

// ─── safeInternalPath: open-redirect clamp ───────────────────────────────────

test("safeInternalPath allows plain in-app paths", () => {
  assert.equal(safeInternalPath("/dashboard"), "/dashboard");
  assert.equal(safeInternalPath("/pool/abc?tab=games"), "/pool/abc?tab=games");
});

test("safeInternalPath clamps absolute, protocol-relative and backslash URLs", () => {
  for (const evil of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "\t//evil.example",
    "/\t/evil.example", // tab stripped -> "//evil.example" -> clamped
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeInternalPath(evil as string), DASHBOARD_PATH, `input: ${evil}`);
  }
});

// ─── assertSameOrigin: the CSRF boundary ─────────────────────────────────────

function reqWith(headers: Record<string, string>): Request {
  return new Request("https://app.example.com/api/x", {
    method: "POST",
    headers,
  });
}

test("assertSameOrigin passes same-host origins", () => {
  const res = assertSameOrigin(
    reqWith({ origin: "https://app.example.com", host: "app.example.com" })
  );
  assert.equal(res, null);
});

test("assertSameOrigin blocks cross-origin browser requests", () => {
  const res = assertSameOrigin(
    reqWith({ origin: "https://attacker.example", host: "app.example.com" })
  );
  assert.ok(res, "expected a NextResponse rejection");
  assert.equal(res!.status, 403);
});

test("assertSameOrigin rejects malformed Origin headers", () => {
  const res = assertSameOrigin(
    reqWith({ origin: "not a url", host: "app.example.com" })
  );
  assert.ok(res);
  assert.equal(res!.status, 403);
});

test("assertSameOrigin lets non-browser callers (no Origin) through", () => {
  const res = assertSameOrigin(reqWith({ host: "app.example.com" }));
  assert.equal(res, null);
});

// ─── enforceRateLimit: fallback limiter (no Redis configured in tests) ───────

test("enforceRateLimit allows up to the limit then returns 429 with Retry-After", async () => {
  const opts = { limit: 3, windowMs: 60_000 };
  const mk = () =>
    new Request("https://app.example.com/api/y", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
  for (let i = 0; i < 3; i++) {
    assert.equal(await enforceRateLimit(mk(), "test:bucket", opts), null, `hit ${i + 1}`);
  }
  const limited = await enforceRateLimit(mk(), "test:bucket", opts);
  assert.ok(limited, "4th hit should be limited");
  assert.equal(limited!.status, 429);
  const retryAfter = Number(limited!.headers.get("Retry-After"));
  assert.ok(retryAfter > 0 && retryAfter <= 60, `Retry-After sane: ${retryAfter}`);
});

test("enforceRateLimit buckets are isolated per key", async () => {
  const opts = { limit: 1, windowMs: 60_000 };
  const mk = (ip: string) =>
    new Request("https://app.example.com/api/z", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
    });
  assert.equal(await enforceRateLimit(mk("198.51.100.1"), "test:iso", opts), null);
  assert.ok(await enforceRateLimit(mk("198.51.100.1"), "test:iso", opts));
  // different IP -> fresh bucket
  assert.equal(await enforceRateLimit(mk("198.51.100.2"), "test:iso", opts), null);
});

// ─── resolveRedisCreds: both naming conventions ──────────────────────────────
//
// A real handover bug: Vercel's Upstash integration injects KV_REST_API_URL /
// KV_REST_API_TOKEN, not the UPSTASH_ names the code originally read, so a
// correctly-provisioned database silently fell through to the in-memory limiter.
// These pin that both name sets resolve, that the read-only token is never used,
// and that a missing half yields null rather than a half-configured client.
test("resolveRedisCreds reads the UPSTASH_ names", () => {
  const save = { ...process.env };
  try {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    process.env.UPSTASH_REDIS_REST_URL = "https://u.example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "utoken";
    assert.deepEqual(resolveRedisCreds(), {
      url: "https://u.example.upstash.io",
      token: "utoken",
    });
  } finally {
    process.env = save;
  }
});

test("resolveRedisCreds reads Vercel's KV_ integration names", () => {
  const save = { ...process.env };
  try {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.KV_REST_API_URL = "https://kv.example.upstash.io";
    process.env.KV_REST_API_TOKEN = "kvtoken";
    // The read-only token must NOT be what gets used — the limiter needs INCR.
    process.env.KV_REST_API_READ_ONLY_TOKEN = "readonly-should-be-ignored";
    assert.deepEqual(resolveRedisCreds(), {
      url: "https://kv.example.upstash.io",
      token: "kvtoken",
    });
  } finally {
    process.env = save;
  }
});

test("resolveRedisCreds returns null when only half is present", () => {
  const save = { ...process.env };
  try {
    for (const k of [
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "KV_REST_API_URL",
      "KV_REST_API_TOKEN",
    ]) delete process.env[k];
    process.env.KV_REST_API_URL = "https://kv.example.upstash.io";
    // token absent
    assert.equal(resolveRedisCreds(), null);
  } finally {
    process.env = save;
  }
});

// ─── CSP ─────────────────────────────────────────────────────────────────────

test("nonces are unique and URL-safe", () => {
  const a = generateNonce();
  const b = generateNonce();
  assert.notEqual(a, b);
  assert.ok(a.length >= 16);
});

test("production CSP carries the nonce and never 'unsafe-inline' in script-src", () => {
  const csp = buildCsp("TESTNONCE");
  const scriptSrc = csp
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("script-src"))!;
  assert.ok(scriptSrc.includes("'nonce-TESTNONCE'"), "nonce present");
  assert.ok(!scriptSrc.includes("'unsafe-inline'"), "no unsafe-inline in script-src");
  assert.ok(csp.includes("frame-ancestors 'none'"), "clickjacking lock");
});

// ─── validations: password policy + money schemas ────────────────────────────

test("signup password policy enforces length, case mix and digit", () => {
  // An adult DOB and accepted terms, so only the password varies.
  const base = {
    name: "Test User",
    email: "t@example.com",
    dateOfBirth: "1990-01-01",
    acceptTerms: true as const,
  };
  assert.ok(!signupSchema.safeParse({ ...base, password: "short1A" }).success);
  assert.ok(!signupSchema.safeParse({ ...base, password: "alllowercase1" }).success);
  assert.ok(!signupSchema.safeParse({ ...base, password: "ALLUPPERCASE1" }).success);
  assert.ok(!signupSchema.safeParse({ ...base, password: "NoDigitsHere" }).success);
  assert.ok(signupSchema.safeParse({ ...base, password: "GoodPassw0rd" }).success);
});

test("signup enforces the age gate server-side", () => {
  const base = {
    name: "Test User",
    email: "t@example.com",
    password: "GoodPassw0rd",
    acceptTerms: true as const,
  };
  const yearsAgo = (n: number) => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - n);
    return d.toISOString().slice(0, 10);
  };

  assert.ok(signupSchema.safeParse({ ...base, dateOfBirth: yearsAgo(30) }).success);
  assert.ok(signupSchema.safeParse({ ...base, dateOfBirth: yearsAgo(18) }).success,
    "exactly 18 is allowed");
  assert.ok(!signupSchema.safeParse({ ...base, dateOfBirth: yearsAgo(17) }).success,
    "17 is refused");

  // The gate cannot be skipped by omitting or malforming the field.
  assert.ok(!signupSchema.safeParse(base).success, "missing DOB is refused");
  assert.ok(!signupSchema.safeParse({ ...base, dateOfBirth: "" }).success);
  assert.ok(!signupSchema.safeParse({ ...base, dateOfBirth: "not-a-date" }).success);
  assert.ok(!signupSchema.safeParse({ ...base, dateOfBirth: "2099-01-01" }).success,
    "a future DOB is refused rather than treated as very old");
});

test("signup requires explicit acceptance of the terms", () => {
  const base = {
    name: "Test User",
    email: "t@example.com",
    password: "GoodPassw0rd",
    dateOfBirth: "1990-01-01",
  };
  assert.ok(!signupSchema.safeParse(base).success, "omitted acceptance is refused");
  assert.ok(!signupSchema.safeParse({ ...base, acceptTerms: false }).success);
  assert.ok(signupSchema.safeParse({ ...base, acceptTerms: true }).success);
});

test("payout account schema normalises and rejects junk", () => {
  const ok = payoutAccountSchema.safeParse({
    method: "paypal",
    identifier: "  User@Example.COM ",
  });
  assert.ok(ok.success);
  assert.equal(ok.data!.identifier, "user@example.com");
  assert.ok(!payoutAccountSchema.safeParse({ method: "venmo", identifier: "a@b.co" }).success);
  assert.ok(!payoutAccountSchema.safeParse({ method: "paypal", identifier: "not-an-email" }).success);
});

test("payout request schema coerces strings and rejects non-positive amounts", () => {
  assert.equal(payoutRequestSchema.safeParse({ amount: "75.50" }).data?.amount, 75.5);
  assert.ok(!payoutRequestSchema.safeParse({ amount: -5 }).success);
  assert.ok(!payoutRequestSchema.safeParse({ amount: "abc" }).success);
  assert.ok(!payoutRequestSchema.safeParse({ amount: Infinity }).success);
});

test("claim/role/uuid schemas hold the line", () => {
  assert.ok(claimPayoutSchema.safeParse({ poolId: "8f14e45f-ceea-4671-9d21-4bd8f7f2f2aa" }).success);
  assert.ok(!claimPayoutSchema.safeParse({ poolId: "1 OR 1=1" }).success);
  assert.ok(updateUserRoleSchema.safeParse({ role: "admin" }).success);
  assert.ok(!updateUserRoleSchema.safeParse({ role: "superadmin" }).success);
  assert.ok(!uuidParamSchema.safeParse("../../etc/passwd").success);
});

// ─── HIBP parsing: stub fetch, never the network ─────────────────────────────

function hibpBody(password: string, count: number, extra = ""): string {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const suffix = sha1.slice(5);
  return `00000AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0\n${suffix}:${count}\n${extra}`;
}

test("breached password is detected from a range response", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = (async () =>
    new Response(hibpBody("password123", 12345), { status: 200 })) as typeof fetch;

  const result = await checkPasswordBreached("password123");
  assert.deepEqual(result, { checked: true, breached: true, count: 12345 });
});

test("padding entries (count 0) are not treated as breaches", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = (async () =>
    new Response(hibpBody("padded-password", 0), { status: 200 })) as typeof fetch;

  const result = await checkPasswordBreached("padded-password");
  assert.equal(result.breached, false);
  assert.equal(result.checked, true);
});

test("clean password comes back unbreached", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = (async () =>
    new Response("ABCDEF1234567890ABCDEF1234567890ABC:9\n", { status: 200 })) as typeof fetch;

  const result = await checkPasswordBreached("unique-Passw0rd-nobody-has");
  assert.deepEqual(result, { checked: true, breached: false, count: 0 });
});

test("HIBP failure fails OPEN (signup proceeds), marked unchecked", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  const result = await checkPasswordBreached("whatever-Passw0rd");
  assert.deepEqual(result, { checked: false, breached: false, count: 0 });

  globalThis.fetch = (async () => new Response("nope", { status: 403 })) as typeof fetch;
  const result403 = await checkPasswordBreached("whatever-Passw0rd");
  assert.deepEqual(result403, { checked: false, breached: false, count: 0 });
});
