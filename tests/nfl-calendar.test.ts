import { test } from "node:test";
import assert from "node:assert/strict";
import { nflSeasonYear, resolveRegularSeasonWeek } from "../src/lib/nfl-slate";
import type { ESPNScoreboardResponse } from "../src/lib/types";

const board = {
  week: { number: 18 }, events: [{ date: "2026-01-04", season: { year: 2025, type: 2 }, week: { number: 18 } }],
  leagues: [{ calendar: [{ value: "2", startDate: "2026-09-06T07:00Z", entries: [
    { value: "1", startDate: "2026-09-06T07:00Z", endDate: "2026-09-16T06:59Z" },
    { value: "2", startDate: "2026-09-16T07:00Z", endDate: "2026-09-23T06:59Z" },
  ] }] }],
} as ESPNScoreboardResponse;
test("calendar overrides stale week 18 from the previous season", () => {
  assert.equal(resolveRegularSeasonWeek(board, 2026, Date.parse("2026-09-17")), 2);
});
test("preseason browsing resolves opening week rather than historical games", () => {
  assert.equal(resolveRegularSeasonWeek(board, 2026, Date.parse("2026-08-17")), 1);
});
test("an unrelated calendar and historical events never masquerade as the requested season", () => {
  assert.equal(resolveRegularSeasonWeek(board, 2027, Date.parse("2027-09-17")), null);
});
test("January and February remain in the NFL season that began last year", () => {
  assert.equal(nflSeasonYear(new Date("2027-01-10")), 2026);
  assert.equal(nflSeasonYear(new Date("2027-02-10")), 2026);
  assert.equal(nflSeasonYear(new Date("2027-09-10")), 2027);
});
