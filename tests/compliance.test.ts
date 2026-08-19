/**
 * Unit tests for the compliance layer.
 *
 * These pin the decisions that carry legal weight, and they run with no
 * network and no database — the pure functions are where the rules actually
 * live, which is why they were written as pure functions.
 *
 * The adversarial cases matter more than the happy ones here. Almost every
 * test below is "can a determined user get past this", not "does it work".
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveGeo } from "../src/lib/compliance/geo";
import { ageInYears, isPlausibleDateOfBirth, meetsMinimumAge } from "../src/lib/compliance/age";
import {
  resolveJurisdiction,
  permitsPlay,
  type JurisdictionRule,
} from "../src/lib/compliance/jurisdiction";

// ─── Geo: header spoofing must not work off a trusted edge ──────────────────

function headers(h: Record<string, string>): Headers {
  return new Headers(h);
}

test("geo headers are IGNORED when not behind a trusted edge", () => {
  const original = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    // An attacker sending these directly must gain nothing.
    const geo = resolveGeo(headers({
      "x-vercel-ip-country": "US",
      "x-vercel-ip-country-region": "CA",
    }));
    assert.equal(geo.country, null, "spoofed country must not be honoured");
    assert.equal(geo.trusted, false);
  } finally {
    if (original === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = original;
  }
});

test("geo headers are read behind a trusted edge", () => {
  const original = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    const geo = resolveGeo(headers({
      "x-vercel-ip-country": "us",
      "x-vercel-ip-country-region": "wa",
    }));
    assert.deepEqual(geo, { country: "US", region: "WA", trusted: true });
  } finally {
    if (original === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = original;
  }
});

test("geo accepts both bare and prefixed region forms, rejects junk", () => {
  const original = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    assert.equal(resolveGeo(headers({
      "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "US-NV",
    })).region, "NV");

    // A malformed country is not guessed at — it resolves to unknown.
    const bad = resolveGeo(headers({ "x-vercel-ip-country": "NOTACOUNTRY" }));
    assert.equal(bad.country, null);
    assert.equal(bad.trusted, false);
  } finally {
    if (original === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = original;
  }
});

// ─── Geo behind a Cloudflare tunnel (the self-hosted stack) ─────────────────

/** Run fn with VERCEL/TRUSTED_PROXY pinned, restoring whatever was there. */
function withEdgeEnv(
  env: { vercel?: string; trustedProxy?: string },
  fn: () => void
) {
  const savedVercel = process.env.VERCEL;
  const savedProxy = process.env.TRUSTED_PROXY;
  if (env.vercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = env.vercel;
  if (env.trustedProxy === undefined) delete process.env.TRUSTED_PROXY;
  else process.env.TRUSTED_PROXY = env.trustedProxy;
  try {
    fn();
  } finally {
    if (savedVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = savedVercel;
    if (savedProxy === undefined) delete process.env.TRUSTED_PROXY;
    else process.env.TRUSTED_PROXY = savedProxy;
  }
}

test("cf-ipcountry is IGNORED unless TRUSTED_PROXY declares Cloudflare", () => {
  withEdgeEnv({}, () => {
    // An origin reachable directly must not honour a forged Cloudflare header.
    const geo = resolveGeo(headers({ "cf-ipcountry": "US", "cf-region-code": "CA" }));
    assert.equal(geo.country, null, "forged cf-ipcountry must not be honoured");
    assert.equal(geo.trusted, false);
  });
});

test("cf-ipcountry is read behind a declared Cloudflare tunnel", () => {
  withEdgeEnv({ trustedProxy: "cloudflare" }, () => {
    const geo = resolveGeo(headers({ "cf-ipcountry": "us", "cf-region-code": "wa" }));
    assert.deepEqual(geo, { country: "US", region: "WA", trusted: true });

    // Country without the region transform still resolves — country rules apply.
    const bare = resolveGeo(headers({ "cf-ipcountry": "GB" }));
    assert.deepEqual(bare, { country: "GB", region: null, trusted: true });
  });
});

test("Cloudflare sentinels XX and T1 resolve to unknown, not a country", () => {
  withEdgeEnv({ trustedProxy: "cloudflare" }, () => {
    for (const sentinel of ["XX", "xx", "T1"]) {
      const geo = resolveGeo(headers({ "cf-ipcountry": sentinel }));
      assert.equal(geo.country, null, `${sentinel} must not read as a country`);
      assert.equal(geo.trusted, false, `${sentinel} must fall through to unknown`);
    }
  });
});

test("x-vercel headers gain nothing behind a Cloudflare-only edge", () => {
  withEdgeEnv({ trustedProxy: "cloudflare" }, () => {
    // Cloudflare does not overwrite Vercel's header names, so off Vercel they
    // are attacker-controlled even when a tunnel fronts the origin.
    const geo = resolveGeo(headers({
      "x-vercel-ip-country": "US",
      "x-vercel-ip-country-region": "CA",
    }));
    assert.equal(geo.country, null, "spoofed x-vercel-ip-country must not be honoured");
    assert.equal(geo.trusted, false);
  });
});

// ─── Age ────────────────────────────────────────────────────────────────────

test("age is computed in whole years and does not round up early", () => {
  const asOf = new Date("2026-08-12T00:00:00Z");
  assert.equal(ageInYears("2008-08-12", asOf), 18, "exact birthday counts");
  assert.equal(ageInYears("2008-08-13", asOf), 17, "one day short does not");
  assert.equal(ageInYears("2008-12-31", asOf), 17, "later in the year does not");
});

test("implausible dates of birth are rejected rather than trusted", () => {
  const asOf = new Date("2026-08-12T00:00:00Z");
  for (const bad of [
    "2027-01-01",   // future
    "1800-01-01",   // impossibly old
    "2026-02-31",   // parses in JS, not a real date
    "12/08/2008",   // wrong format
    "2008-8-12",    // unpadded
    "",
    "not-a-date",
  ]) {
    assert.equal(isPlausibleDateOfBirth(bad, asOf), false, `should reject: ${bad}`);
  }
  assert.equal(isPlausibleDateOfBirth("2000-06-15", asOf), true);
});

test("minimum age fails CLOSED on missing or malformed input", () => {
  const asOf = new Date("2026-08-12T00:00:00Z");
  assert.equal(meetsMinimumAge(null, 18, asOf), false);
  assert.equal(meetsMinimumAge(undefined, 18, asOf), false);
  assert.equal(meetsMinimumAge("", 18, asOf), false);
  assert.equal(meetsMinimumAge("garbage", 18, asOf), false);
  // A future date must never satisfy an age check.
  assert.equal(meetsMinimumAge("2030-01-01", 18, asOf), false);
});

test("jurisdictions requiring 21 are not satisfied by an 18-year-old", () => {
  const asOf = new Date("2026-08-12T00:00:00Z");
  const eighteen = "2008-01-01";
  assert.equal(meetsMinimumAge(eighteen, 18, asOf), true);
  assert.equal(meetsMinimumAge(eighteen, 21, asOf), false);
});

// ─── Jurisdiction resolution ────────────────────────────────────────────────

const RULES: JurisdictionRule[] = [
  { country_code: "US", region_code: "NV", status: "review",  minimum_age: 21, requires_license: true,  notes: null },
  { country_code: "US", region_code: "WA", status: "blocked", minimum_age: 18, requires_license: false, notes: null },
  { country_code: "US", region_code: "*",  status: "allowed", minimum_age: 18, requires_license: false, notes: null },
  { country_code: "GB", region_code: "*",  status: "review",  minimum_age: 18, requires_license: true,  notes: null },
];

const DEFAULTS = { status: "allowed" as const, minimumAge: 18 };

test("a region rule beats the country rule", () => {
  const nv = resolveJurisdiction(RULES, "US", "NV", DEFAULTS);
  assert.equal(nv.status, "review");
  assert.equal(nv.minimumAge, 21);
  assert.equal(nv.matchLevel, "region");
});

test("an unlisted region falls back to the country rule", () => {
  const tx = resolveJurisdiction(RULES, "US", "TX", DEFAULTS);
  assert.equal(tx.status, "allowed");
  assert.equal(tx.matchLevel, "country");
});

test("an unlisted country falls back to the configured default", () => {
  const fr = resolveJurisdiction(RULES, "FR", null, DEFAULTS);
  assert.equal(fr.status, "allowed");
  assert.equal(fr.matchLevel, "default");

  // ...and a deny-by-default posture is honoured.
  const strict = resolveJurisdiction(RULES, "FR", null, { status: "blocked", minimumAge: 21 });
  assert.equal(strict.status, "blocked");
  assert.equal(strict.minimumAge, 21);
});

test("an unknown country never matches a rule", () => {
  const unknown = resolveJurisdiction(RULES, null, null, DEFAULTS);
  assert.equal(unknown.matchLevel, "default");
  assert.equal(unknown.matchedRule, null);
});

test("resolution is case-insensitive on both country and region", () => {
  const lower = resolveJurisdiction(RULES, "us", "wa", DEFAULTS);
  assert.equal(lower.status, "blocked");
  assert.equal(lower.matchLevel, "region");
});

test("only 'allowed' permits play — 'review' refuses like 'blocked'", () => {
  assert.equal(permitsPlay("allowed"), true);
  assert.equal(permitsPlay("blocked"), false);
  assert.equal(permitsPlay("review"), false,
    "an unreviewed jurisdiction must not be treated as permission");
});

test("a blocked region inside an allowed country is still blocked", () => {
  // The regression that matters: "US is fine" must not leak Washington through.
  const wa = resolveJurisdiction(RULES, "US", "WA", DEFAULTS);
  assert.equal(permitsPlay(wa.status), false);
  const us = resolveJurisdiction(RULES, "US", "OH", DEFAULTS);
  assert.equal(permitsPlay(us.status), true);
});
