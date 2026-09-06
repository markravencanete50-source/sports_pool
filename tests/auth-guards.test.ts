import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdmin } from "../src/lib/require-admin";
import { readAccountStanding } from "../src/lib/account-standing";

function client(options: {
  profile?: Record<string, unknown> | null;
  profileError?: boolean;
  currentLevel?: string;
  nextLevel?: string;
  aalError?: boolean;
  noAal?: boolean;
  anonymous?: boolean;
} = {}) {
  const profile = options.profile === undefined
    ? { role: "admin", admin_role: "super_admin", account_status: "active", suspended_until: null }
    : options.profile;
  const result = { data: profile, error: options.profileError ? new Error("database unavailable") : null };
  const chain = { select: () => chain, eq: () => chain, single: async () => result, maybeSingle: async () => result };
  return {
    from: () => chain,
    auth: {
      getUser: async () => ({ data: { user: options.anonymous ? null : { id: "test-user", app_metadata: { role: "admin" } } }, error: null }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({
        data: options.noAal ? null : { currentLevel: options.currentLevel ?? "aal2", nextLevel: options.nextLevel ?? "aal2" },
        error: options.aalError ? new Error("auth unavailable") : null,
      }) },
    },
  } as unknown as SupabaseClient;
}

test("admin access requires enrolment even for read routes", async () => {
  const res = await requireAdmin(client({ currentLevel: "aal1", nextLevel: "aal1" }));
  assert.ok(res instanceof NextResponse);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "mfa_enrollment_required");
});

test("an enrolled admin must verify the current session", async () => {
  const res = await requireAdmin(client({ currentLevel: "aal1" }));
  assert.ok(res instanceof NextResponse);
  assert.equal((await res.json()).code, "mfa_challenge_required");
});

test("admin access fails closed when assurance or profile lookup fails", async () => {
  for (const options of [{ aalError: true }, { noAal: true }, { profileError: true }, { profile: null }]) {
    const res = await requireAdmin(client(options));
    assert.ok(res instanceof NextResponse);
    assert.equal(res.status, 403);
  }
});

test("aal2 cannot override an inactive account or demotion", async () => {
  for (const profile of [
    { role: "user", account_status: "active" },
    { role: "admin", account_status: "blocked" },
    { role: "admin", account_status: "suspended" },
    { role: "admin", account_status: null },
  ]) {
    const res = await requireAdmin(client({ profile }));
    assert.ok(res instanceof NextResponse);
    assert.equal(res.status, 403);
  }
});

test("verified admins retain only their assigned permissions", async () => {
  const moderator = client({ profile: { role: "admin", admin_role: "moderator", account_status: "active" } });
  const denied = await requireAdmin(moderator, { permission: "admins.manage" });
  assert.ok(denied instanceof NextResponse);
  assert.equal((await denied.json()).code, "permission_denied");
  const allowed = await requireAdmin(moderator, { permission: "moderation.manage" });
  assert.ok(!(allowed instanceof NextResponse));
  assert.equal(allowed.adminRole, "moderator");
});

test("anonymous callers get 401 and verified super admins get access", async () => {
  const denied = await requireAdmin(client({ anonymous: true }));
  assert.ok(denied instanceof NextResponse);
  assert.equal(denied.status, 401);
  assert.ok(!(await requireAdmin(client(), { permission: "admins.manage", requireMfa: true }) instanceof NextResponse));
});

test("sign-in standing lookup refuses errors, absent profiles and unknown status", async () => {
  for (const options of [
    { profileError: true }, { profile: null }, { profile: { account_status: null } },
    { profile: { account_status: "unexpected" } },
    { profile: { account_status: "suspended", suspended_until: "invalid" } },
  ]) {
    await assert.rejects(readAccountStanding(client(options), "test-user"));
  }
});

test("sign-in standing lookup preserves blocked and suspended status", async () => {
  for (const status of ["active", "blocked", "suspended"]) {
    const result = await readAccountStanding(client({ profile: { account_status: status, suspended_until: null } }), "test-user");
    assert.equal(result.status, status);
    assert.equal(result.suspendedUntil, null);
  }
});
