import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_ROLES,
  PERMISSIONS,
  hasPermission,
  permissionsFor,
  resolveAdminRole,
} from "../src/lib/admin/permissions";
import { hashPoolPassword, verifyPoolPassword, SHARE_SLUG_PATTERN } from "../src/lib/pool-password";
import { extractLiveState, isCompetitionInProgress } from "../src/lib/espn-live";
import { filterRegularSeasonSlate } from "../src/lib/nfl-slate";
import { createPoolSchema, updatePoolWithGamesSchema, contentReportSchema } from "../src/lib/validations";
import type { ESPNGame } from "../src/lib/types";

/**
 * Pins for the release that added the client-brief features and the admin
 * console. Each block guards an invariant a route relies on rather than the
 * route itself (those are covered structurally by routes.test.ts).
 */

describe("admin roles and permissions", () => {
  test("an admin with no narrowed role is a super admin with every permission", () => {
    assert.equal(resolveAdminRole({ role: "admin", admin_role: null }), "super_admin");
    assert.deepEqual([...permissionsFor("super_admin")], [...PERMISSIONS]);
  });

  test("a non-admin never resolves to a role, whatever admin_role says", () => {
    assert.equal(resolveAdminRole({ role: "user", admin_role: "super_admin" }), null);
    assert.equal(hasPermission(null, "users.view"), false);
  });

  test("an unknown admin_role fails closed instead of granting super admin", () => {
    assert.equal(resolveAdminRole({ role: "admin", admin_role: "made_up" }), null);
  });

  test("narrowed roles cannot reach money or admin management", () => {
    for (const role of ADMIN_ROLES.filter((r) => r !== "super_admin")) {
      assert.equal(hasPermission(role, "admins.manage"), false, `${role} must not manage admins`);
      assert.equal(hasPermission(role, "settings.manage"), false, `${role} must not manage settings`);
    }
    assert.equal(hasPermission("moderator", "withdrawals.approve"), false);
    assert.equal(hasPermission("support_admin", "withdrawals.approve"), false);
    assert.equal(hasPermission("finance_admin", "withdrawals.approve"), true);
    assert.equal(hasPermission("operations_admin", "winners.recalculate"), true);
    assert.equal(hasPermission("moderator", ["moderation.manage", "users.suspend"]), true);
  });

  test("every permission a role lists is a real permission", () => {
    for (const role of ADMIN_ROLES) {
      for (const p of permissionsFor(role)) {
        assert.ok((PERMISSIONS as readonly string[]).includes(p), `${role} lists unknown permission ${p}`);
      }
    }
  });
});

describe("pool passwords and share slugs", () => {
  test("hashes verify, are salted, and never store the password", () => {
    const a = hashPoolPassword("gameday");
    const b = hashPoolPassword("gameday");
    assert.notEqual(a, b, "two hashes of the same password must differ (salted)");
    assert.ok(a.startsWith("scrypt$"));
    assert.ok(!a.includes("gameday"));
    assert.equal(verifyPoolPassword("gameday", a), true);
    assert.equal(verifyPoolPassword("GAMEDAY", a), false);
    assert.equal(verifyPoolPassword("gameday", null), false);
    assert.equal(verifyPoolPassword("gameday", "garbage"), false);
  });

  test("share slugs are ten characters from the unambiguous alphabet", () => {
    assert.ok(SHARE_SLUG_PATTERN.test("bcdfghjkmn"));
    assert.ok(!SHARE_SLUG_PATTERN.test("abcdefghij"), "vowels are excluded");
    assert.ok(!SHARE_SLUG_PATTERN.test("bcdfghjkm0"), "0 is excluded");
    assert.ok(!SHARE_SLUG_PATTERN.test("bcdfghjkm"), "must be exactly ten");
  });
});

describe("ESPN live state", () => {
  const competition = (over: Record<string, unknown>) => ({
    id: "1",
    date: "2026-09-13T17:00:00Z",
    status: { type: { completed: false, description: "In Progress", state: "in" }, period: 3, displayClock: "7:42" },
    competitors: [
      { id: "10", homeAway: "home" as const, team: { id: "10", abbreviation: "KC", displayName: "Chiefs", logo: "" }, score: "17" },
      { id: "20", homeAway: "away" as const, team: { id: "20", abbreviation: "BUF", displayName: "Bills", logo: "" }, score: "14" },
    ],
    situation: { possession: "20", downDistanceText: "3rd & 7 at KC 32", yardLine: 68, isRedZone: false },
    ...over,
  });

  test("maps possession from ESPN team id to our abbreviation", () => {
    const live = extractLiveState(competition({}) as never, new Date("2026-09-13T18:00:00Z"));
    assert.equal(live.possession, "BUF");
    assert.equal(live.period, 3);
    assert.equal(live.display_clock, "7:42");
    assert.equal(live.down_distance, "3rd & 7 at KC 32");
    assert.equal(live.yard_line, 68);
    assert.equal(live.is_red_zone, false);
    assert.equal(live.last_synced_at, "2026-09-13T18:00:00.000Z");
  });

  test("a finished game carries no clock, ball or possession", () => {
    const done = competition({ status: { type: { completed: true, description: "Final", state: "post" }, period: 4, displayClock: "0:00" } });
    assert.equal(isCompetitionInProgress(done as never), false);
    const live = extractLiveState(done as never);
    assert.equal(live.possession, null);
    assert.equal(live.display_clock, null);
    assert.equal(live.down_distance, null);
    assert.equal(live.yard_line, null);
    assert.equal(live.period, 4);
  });
});

describe("NFL weekly slate filtering", () => {
  const game = (id: string, season: number, seasonType: number, week: number) =>
    ({
      id,
      date: "2026-09-13T17:00:00Z",
      season: { year: season, type: seasonType },
      week: { number: week },
      competitions: [],
    }) as ESPNGame;

  test("keeps only the requested regular-season week", () => {
    const mixedScoreboard = [
      game("current", 2026, 2, 1),
      game("preseason", 2026, 1, 1),
      game("historical", 2025, 2, 1),
      game("next-week", 2026, 2, 2),
    ];

    assert.deepEqual(
      filterRegularSeasonSlate(mixedScoreboard, 2026, 1).map(({ id }) => id),
      ["current"],
    );
  });
});

describe("pool window validation", () => {
  const base = {
    name: "Weekend pool",
    type: "private" as const,
    entryFee: 25,
    maxParticipants: null,
    week: 3,
    selectedGames: ["a", "b", "c", "d", "e", "f"],
  };

  test("accepts a window of up to seven days and rejects longer or inverted ones", () => {
    const start = "2026-09-10T12:00:00.000Z";
    assert.ok(createPoolSchema.safeParse({ ...base, startsAt: start, endsAt: "2026-09-17T12:00:00.000Z" }).success);
    assert.ok(!createPoolSchema.safeParse({ ...base, startsAt: start, endsAt: "2026-09-17T12:00:01.000Z" }).success, "7 days + 1s must fail");
    assert.ok(!createPoolSchema.safeParse({ ...base, startsAt: start, endsAt: "2026-09-09T12:00:00.000Z" }).success, "end before start must fail");
    assert.ok(createPoolSchema.safeParse({ ...base }).success, "no window is still valid");
  });

  test("password length is bounded and update accepts null to clear it", () => {
    assert.ok(!createPoolSchema.safeParse({ ...base, password: "abc" }).success);
    assert.ok(createPoolSchema.safeParse({ ...base, password: "abcd" }).success);
    assert.ok(updatePoolWithGamesSchema.safeParse({ password: null }).success);
  });

  test("a content report needs a real reason", () => {
    assert.ok(!contentReportSchema.safeParse({ reason: "x" }).success);
    assert.ok(contentReportSchema.safeParse({ reason: "sharing picks" }).success);
  });
});
