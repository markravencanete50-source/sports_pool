import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateCompliance } from "../src/lib/compliance/gate";

function client(fail?: string, standing: unknown = { account_status: "active", suspended_until: null }) {
  const rows: Record<string, unknown> = {
    user_compliance: { date_of_birth: "1990-01-01", tos_accepted_at: "2026-01-01", tos_version: "v1", kyc_status: "verified" },
    compliance_settings: { geo_enforcement_enabled: false, default_jurisdiction_status: "allowed", default_minimum_age: 18, kyc_payout_threshold: 600, current_tos_version: "v1" },
    jurisdiction_rules: [], users: standing,
  };
  return {
    rpc: async () => ({ error: fail === "limits" ? { message: "unavailable" } : null }),
    from: (table: string) => {
      const result = { data: rows[table], error: fail === table ? { message: "unavailable" } : null };
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => result,
        then: (resolve: (value: unknown) => unknown) => resolve(result) };
      return chain;
    },
  } as unknown as SupabaseClient;
}
const input = { userId: "qa-user", headers: new Headers(), action: "deposit" as const, amount: 20 };

test("eligibility reads fail closed even when an error also returns plausible data", async () => {
  for (const failure of ["limits", "user_compliance", "compliance_settings", "jurisdiction_rules", "users"]) {
    const result = await evaluateCompliance(input, client(failure));
    assert.equal(result.allowed, false, failure);
    if (!result.allowed) assert.equal(result.status, 503);
  }
});
test("missing, unknown and malformed account standing never authorizes a deposit", async () => {
  for (const standing of [null, { account_status: "unknown" }, { account_status: "suspended", suspended_until: "invalid" }]) {
    const result = await evaluateCompliance(input, client(undefined, standing));
    assert.equal(result.allowed, false);
    if (!result.allowed) assert.equal(result.status, 503);
  }
});
test("valid eligibility reads preserve the allowed path", async () => {
  assert.equal((await evaluateCompliance(input, client())).allowed, true);
});
