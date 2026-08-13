/**
 * Migration pipeline guard.
 *
 * WHY THIS EXISTS. Supabase keys applied migrations by the numeric version
 * prefix of the filename, not by the filename. Two files sharing a prefix are
 * therefore ONE migration as far as the ledger is concerned: the first to run
 * records the version, and every later file with that same prefix is treated as
 * already applied and silently skipped.
 *
 * This is not hypothetical. Three prefixes were duplicated in this repository:
 *
 *   20260807000000  close_stale_write_policies      +  add_missing_rpcs_...
 *   20260808000000  zero_security_advisors_...      +  final_audit_fixes
 *   20260809000000  lock_pools_pool_games_...       +  drop_legacy_picks_table
 *
 * WHAT THIS DID AND DID NOT COST. Production is fine: every object those files
 * create was verified present live (get_public_winners, claim_pool_payout,
 * set_pool_transaction_fee all exist; the legacy `picks` table is gone). They
 * reached the database because they were applied BY HAND under different names
 * rather than through the file pipeline — which is also why the remote ledger's
 * versions are apply-timestamps that do not correspond to these prefixes at all.
 *
 * The cost is a fresh provision. `supabase db push` against an empty database
 * walks the files, records the first of each duplicated prefix, and silently
 * skips its twin — reporting success either way. A new environment would come
 * up missing three migrations' worth of RPCs and grants, and the first symptom
 * would be a money path failing on a function that "obviously" exists.
 * `handover_hardening` makes that concrete: it revokes on
 * set_pool_transaction_fee(), created by the skipped `final_audit_fixes`, so a
 * clean provision would error outright.
 *
 * On a product that moves money, a migration you believe ran and did not is
 * exactly the kind of gap that reaches production intact.
 *
 * The check is deliberately cheap and offline so it can block a merge.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** `<14-digit version>_<name>.sql` — the shape the Supabase CLI expects. */
const FILENAME = /^(\d{14})_([a-z0-9_]+)\.sql$/;

interface Problem {
  severity: "error";
  message: string;
}

function check(): Problem[] {
  const problems: Problem[] = [];

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    return [{ severity: "error", message: "No migrations found — is the path right?" }];
  }

  // 1. Filename shape. A file the CLI cannot parse is a file it will not run.
  const parsed: Array<{ file: string; version: string; name: string }> = [];
  for (const file of files) {
    const m = FILENAME.exec(file);
    if (!m) {
      problems.push({
        severity: "error",
        message:
          `${file}: filename does not match <14-digit-version>_<snake_case_name>.sql. ` +
          `The Supabase CLI derives the version from this prefix; an unparseable ` +
          `name is not applied.`,
      });
      continue;
    }
    parsed.push({ file, version: m[1], name: m[2] });
  }

  // 2. Duplicate versions — the bug this script exists for.
  const byVersion = new Map<string, string[]>();
  for (const p of parsed) {
    const list = byVersion.get(p.version) ?? [];
    list.push(p.file);
    byVersion.set(p.version, list);
  }
  for (const [version, group] of byVersion) {
    if (group.length > 1) {
      problems.push({
        severity: "error",
        message:
          `Duplicate migration version ${version} shared by ${group.length} files:\n` +
          group.map((f) => `      - ${f}`).join("\n") +
          `\n    Only the first will ever be applied; the rest are silently skipped. ` +
          `Renumber all but one so every version is unique.`,
      });
    }
  }

  // 3. Timestamp sanity. A version that is not a plausible UTC timestamp usually
  //    means a hand-edited prefix, which tends to land in the wrong order.
  for (const p of parsed) {
    const y = Number(p.version.slice(0, 4));
    const mo = Number(p.version.slice(4, 6));
    const d = Number(p.version.slice(6, 8));
    const h = Number(p.version.slice(8, 10));
    const mi = Number(p.version.slice(10, 12));
    const s = Number(p.version.slice(12, 14));
    const valid =
      y >= 2000 && y <= 2999 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 &&
      h <= 23 && mi <= 59 && s <= 59;
    if (!valid) {
      problems.push({
        severity: "error",
        message: `${p.file}: version ${p.version} is not a valid UTC timestamp (YYYYMMDDHHMMSS).`,
      });
    }
  }

  return problems;
}

const problems = check();
const total = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).length;

if (problems.length === 0) {
  console.log(`migration check passed — ${total} migrations, all versions unique and well-formed`);
  process.exit(0);
}

console.error(`\nmigration check FAILED — ${problems.length} problem(s):\n`);
for (const p of problems) console.error(`  [error] ${p.message}\n`);
process.exit(1);
