/**
 * Vercel cron guard.
 *
 * WHY THIS EXISTS. This project is on the Vercel Hobby plan, where cron
 * schedules are day-granularity. A sub-daily expression is not clamped or
 * ignored — Vercel REFUSES TO CREATE THE DEPLOYMENT. There is no failed build
 * to open, no error in the deployment list, nothing: the commit simply never
 * deploys, and production keeps serving the previous release.
 *
 * This is not hypothetical, and the repository had already learned it once.
 * 662c420 chose a once-daily schedule on purpose and wrote down why:
 *
 *     "Cron frequency: every-15-minutes silently requires Vercel Pro - Hobby
 *      crons are day-granularity. vercel.json carries a once-daily schedule
 *      valid on any plan and the GitHub Actions workflow supplies the frequent
 *      cadence."
 *
 * 7e0bf34 then changed settle to hourly ("0 * * * *"). Every commit from that
 * one onward stopped producing a deployment. The last build Vercel accepted was
 * 5e9c344; five subsequent commits — including the entire regulatory compliance
 * layer — were never deployed, while CI stayed green the whole time. A gate that
 * is green while production is stale is worse than no gate.
 *
 * So the rule is enforced here rather than remembered: every schedule in
 * vercel.json must run at most once per day. The frequent cadence belongs in
 * .github/workflows/, which is free and has no granularity limit.
 *
 * WHEN THIS PROJECT MOVES TO PRO. Sub-daily schedules become legal. Set
 * ALLOW_SUBDAILY_CRONS=1 (or delete this check) and retire the Actions
 * workflows — in that order, not before.
 *
 * Offline and instant, so it can block a merge.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONFIG = join(process.cwd(), "vercel.json");

/**
 * Vercel rejects unknown top-level properties in vercel.json, so a "//" comment
 * key is itself a deployment-refusing mistake. Only these may appear.
 */
const KNOWN_TOP_LEVEL = new Set([
  "$schema", "buildCommand", "cleanUrls", "crons", "devCommand", "framework",
  "functions", "git", "headers", "ignoreCommand", "images", "installCommand",
  "outputDirectory", "public", "redirects", "regions", "rewrites",
  "trailingSlash",
]);

interface Cron {
  path?: unknown;
  schedule?: unknown;
}

const problems: string[] = [];

let raw: string;
try {
  raw = readFileSync(CONFIG, "utf8");
} catch {
  console.log("cron check skipped — no vercel.json");
  process.exit(0);
}

let config: Record<string, unknown>;
try {
  config = JSON.parse(raw) as Record<string, unknown>;
} catch (err) {
  console.error(
    `\ncron check FAILED — vercel.json is not valid JSON: ` +
      `${err instanceof Error ? err.message : String(err)}\n` +
      `  Vercel cannot parse it either, so nothing will deploy.\n`
  );
  process.exit(1);
}

for (const key of Object.keys(config)) {
  if (!KNOWN_TOP_LEVEL.has(key)) {
    problems.push(
      `Unknown top-level property "${key}" in vercel.json. Vercel validates ` +
        `this file strictly and rejects additional properties, which refuses the ` +
        `deployment. JSON has no comments — put the explanation in a doc or a ` +
        `script, not in the config.`
    );
  }
}

const crons = Array.isArray(config.crons) ? (config.crons as Cron[]) : [];
const allowSubDaily = process.env.ALLOW_SUBDAILY_CRONS === "1";

for (const [i, cron] of crons.entries()) {
  const where = typeof cron?.path === "string" ? cron.path : `crons[${i}]`;
  const schedule = cron?.schedule;

  if (typeof schedule !== "string" || schedule.trim() === "") {
    problems.push(`${where}: missing or non-string "schedule".`);
    continue;
  }
  if (typeof cron.path !== "string" || !cron.path.startsWith("/")) {
    problems.push(`${where}: "path" must be a string starting with "/".`);
  }

  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) {
    problems.push(
      `${where}: schedule "${schedule}" has ${fields.length} fields; Vercel ` +
        `expects exactly 5 (minute hour day-of-month month day-of-week).`
    );
    continue;
  }

  if (allowSubDaily) continue;

  const [minute, hour] = fields;

  // Runs more than once a day iff the minute or hour field matches more than
  // one value — i.e. contains a wildcard, step, range, or list.
  const multiValued = (field: string) => /[*\/,-]/.test(field);

  if (multiValued(minute) || multiValued(hour)) {
    problems.push(
      `${where}: schedule "${schedule}" runs more than once a day. On the Hobby ` +
        `plan Vercel REFUSES THE DEPLOYMENT for a sub-daily schedule — the commit ` +
        `never builds and production silently keeps serving the old release.\n` +
        `    Use a fixed minute and hour (e.g. "0 8 * * *") and put the frequent ` +
        `cadence in .github/workflows/ instead.\n` +
        `    On Pro this restriction lifts: set ALLOW_SUBDAILY_CRONS=1.`
    );
  }
}

if (problems.length === 0) {
  console.log(
    `vercel cron check passed — ${crons.length} cron(s), all day-granularity` +
      `${allowSubDaily ? " (sub-daily allowed)" : ""}`
  );
  process.exit(0);
}

console.error(`\nvercel cron check FAILED — ${problems.length} problem(s):\n`);
for (const p of problems) console.error(`  [error] ${p}\n`);
process.exit(1);
