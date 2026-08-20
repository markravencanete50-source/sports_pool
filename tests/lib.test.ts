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
import { assertPayoutModeSafe } from "../src/lib/paypal";
import { readImageDimensions } from "../src/lib/image-dimensions";
import {
  displayNameKey,
  normalizeDisplayName,
  checkDisplayNameShape,
  displayNameSchema,
} from "../src/lib/display-name";

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

// ─── assertPayoutModeSafe: sandbox money must never leave a real balance ─────

/** Pin the deployment-shape env vars for one assertion, restoring after. */
function withPayoutEnv(
  env: Partial<Record<"VERCEL_ENV" | "NODE_ENV" | "PAYPAL_MODE" | "ALLOW_SANDBOX_PAYOUTS", string>>,
  fn: () => void
) {
  // @types/node marks NODE_ENV readonly; tests legitimately swap it.
  const mutableEnv = process.env as Record<string, string | undefined>;
  const keys = ["VERCEL_ENV", "NODE_ENV", "PAYPAL_MODE", "ALLOW_SANDBOX_PAYOUTS"] as const;
  const saved = keys.map((k) => [k, process.env[k]] as const);
  for (const k of keys) {
    if (env[k] === undefined) delete mutableEnv[k];
    else mutableEnv[k] = env[k];
  }
  try {
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete mutableEnv[k];
      else mutableEnv[k] = v;
    }
  }
}

test("sandbox payouts are refused on a self-hosted production build", () => {
  // No VERCEL_ENV exists off Vercel — NODE_ENV is the only production signal,
  // and this exact shape used to slip past a VERCEL_ENV-only check.
  withPayoutEnv({ NODE_ENV: "production", PAYPAL_MODE: "sandbox" }, () => {
    assert.ok(assertPayoutModeSafe(), "expected the sandbox-in-production refusal");
  });
});

test("ALLOW_SANDBOX_PAYOUTS=true is an explicit test-window opt-out", () => {
  withPayoutEnv(
    { NODE_ENV: "production", PAYPAL_MODE: "sandbox", ALLOW_SANDBOX_PAYOUTS: "true" },
    () => assert.equal(assertPayoutModeSafe(), null)
  );
  // Anything other than exactly "true" keeps the refusal.
  withPayoutEnv(
    { NODE_ENV: "production", PAYPAL_MODE: "sandbox", ALLOW_SANDBOX_PAYOUTS: "1" },
    () => assert.ok(assertPayoutModeSafe(), "only the literal 'true' may opt out")
  );
});

test("Vercel previews may run sandbox; Vercel production may not", () => {
  // Previews build with NODE_ENV=production — VERCEL_ENV is what tells them apart.
  withPayoutEnv(
    { VERCEL_ENV: "preview", NODE_ENV: "production", PAYPAL_MODE: "sandbox" },
    () => assert.equal(assertPayoutModeSafe(), null)
  );
  withPayoutEnv(
    { VERCEL_ENV: "production", NODE_ENV: "production", PAYPAL_MODE: "sandbox" },
    () => assert.ok(assertPayoutModeSafe())
  );
});

test("live mode passes the guard everywhere", () => {
  withPayoutEnv({ NODE_ENV: "production", PAYPAL_MODE: "live" }, () => {
    assert.equal(assertPayoutModeSafe(), null);
  });
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

// ─── display names: uniqueness key, shape rules, impersonation defences ──────

test("the uniqueness key folds case and collapses whitespace", () => {
  const variants = ["John Smith", "john smith", "JOHN  SMITH", "  John   Smith  "];
  const keys = new Set(variants.map(displayNameKey));
  assert.equal(keys.size, 1, `expected one key, got ${[...keys].join(" | ")}`);
  assert.equal(displayNameKey("John Smith"), "john smith");
});

test("invisible characters cannot be used to clone a taken name", () => {
  // Each of these renders identically to "admin" and must normalise to it,
  // or the unique index and the reserved list are both trivially bypassed.
  const disguises = [
    "ad​min",  // zero-width space
    "ad‌min",  // zero-width non-joiner
    "ad‍min",  // zero-width joiner
    "﻿admin",  // BOM
    "admin⁠",  // word joiner
    "ad‮min",  // right-to-left override
  ];
  for (const d of disguises) {
    assert.equal(displayNameKey(d), "admin", `${JSON.stringify(d)} must fold to "admin"`);
  }
});

test("the stored form keeps the user's capitalisation", () => {
  // Only the KEY is lowercased. Storing the folded value would silently
  // rename every account that uses capitals.
  assert.equal(normalizeDisplayName("John Smith"), "John Smith");
  assert.equal(normalizeDisplayName("  John   Smith  "), "John Smith");
  assert.equal(normalizeDisplayName("ad​min"), "admin");
});

test("shape rules match the users_name_format constraint", () => {
  assert.equal(checkDisplayNameShape("Bob"), null);
  assert.equal(checkDisplayNameShape("Bob_the-Builder.1"), null);
  assert.equal(checkDisplayNameShape("a".repeat(24)), null);

  assert.equal(checkDisplayNameShape("ab"), "too_short");
  assert.equal(checkDisplayNameShape("a".repeat(25)), "too_long");
  assert.equal(checkDisplayNameShape("..."), "no_alphanumeric");
  assert.equal(checkDisplayNameShape("bad!name"), "invalid_characters");
  // ASCII-only is deliberate; see the note in src/lib/display-name.ts. It is
  // also what keeps the JS and Postgres case-folding difference unreachable.
  assert.equal(checkDisplayNameShape("café"), "invalid_characters");
  assert.equal(checkDisplayNameShape("Ünicode"), "invalid_characters");
});

test("whitespace-only and padded names are judged on their trimmed form", () => {
  assert.equal(checkDisplayNameShape("   "), "too_short");
  assert.equal(checkDisplayNameShape("  ab  "), "too_short");
  assert.equal(checkDisplayNameShape("  Bob  "), null);
});

test("the display-name schema returns the value that will be stored", () => {
  const ok = displayNameSchema.safeParse("  John   Smith  ");
  assert.ok(ok.success);
  assert.equal(ok.data, "John Smith");

  for (const bad of ["ab", "!!!", "a".repeat(200), ""]) {
    assert.equal(displayNameSchema.safeParse(bad).success, false, `should reject: ${bad}`);
  }
});

// ─── image dimensions: the avatar decompression-bomb defence ────────────────
//
// Byte size does not bound decode cost. A 545-byte PNG can declare 30000x30000,
// which a browser expands to ~3.6GB of RGBA. Uploaded as an avatar that is a
// denial of service against every OTHER user who loads the page, so the header
// is parsed and implausible dimensions are refused before anything is stored.

/** Build a PNG header declaring the given size. Only IHDR matters here. */
function pngHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

test("PNG dimensions are read from the header", () => {
  assert.deepEqual(readImageDimensions(pngHeader(64, 64), "image/png"), {
    width: 64,
    height: 64,
  });
  // The bomb: tiny file, enormous declared size.
  assert.deepEqual(readImageDimensions(pngHeader(30000, 30000), "image/png"), {
    width: 30000,
    height: 30000,
  });
});

test("JPEG dimensions are read from the frame header", () => {
  // SOI, SOF0 (length 17, 8-bit, 600 high, 800 wide), component data, EOI.
  const jpeg = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    0x02, 0x58, // height 600
    0x03, 0x20, // width 800
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
  assert.deepEqual(readImageDimensions(jpeg, "image/jpeg"), {
    width: 800,
    height: 600,
  });
});

test("WebP dimensions are read from the VP8 chunk", () => {
  const webp = new Uint8Array(30);
  webp.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  webp.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  webp.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  new DataView(webp.buffer).setUint16(26, 120, true);
  new DataView(webp.buffer).setUint16(28, 90, true);
  assert.deepEqual(readImageDimensions(webp, "image/webp"), {
    width: 120,
    height: 90,
  });
});

test("unreadable headers refuse rather than throw", () => {
  // Every one of these must come back null, which the route treats as a
  // refusal. Throwing here would turn a malformed upload into a 500.
  assert.equal(readImageDimensions(new Uint8Array([]), "image/png"), null);
  assert.equal(readImageDimensions(new Uint8Array([0x89, 0x50]), "image/png"), null);
  assert.equal(readImageDimensions(new Uint8Array(40), "image/jpeg"), null);
  assert.equal(readImageDimensions(new Uint8Array(10), "image/webp"), null);
  // Zero dimensions are not a valid image either.
  assert.equal(readImageDimensions(pngHeader(0, 100), "image/png"), null);
});
