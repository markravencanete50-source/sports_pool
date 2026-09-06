/**
 * Push SportsPool's Auth branding and redirect configuration to a hosted
 * Supabase project through the Management API.
 *
 * WHAT IT SETS
 *   - Site URL and the redirect allow-list (where confirmation / recovery /
 *     magic-link mails send people — i.e. "redirect to SportsPool")
 *   - Every auth email subject + HTML body from supabase/templates/*.html
 *   - Email confirmation required (mailer_autoconfirm = false)
 *   - TOTP enrol/verify enabled (the admin console requires it)
 *   - Password policy matching src/lib/validations.ts (10+, mixed case + digit)
 *   - Optionally, custom SMTP so the From: line reads SportsPool instead of
 *     Supabase (SMTP_* env vars; without them the body/subject are branded
 *     but the sender remains Supabase's shared mailer)
 *
 * WHY NOT `supabase config push`: it pushes the WHOLE local config.toml
 * (db pooler, api, storage, local-dev auth values such as site_url =
 * localhost and TOTP disabled) — a footgun against a live project. This
 * script touches only the auth keys listed above and shows a diff first.
 *
 * USAGE
 *   SUPABASE_ACCESS_TOKEN=sbp_... npx tsx scripts/apply-auth-config.ts \
 *     --project-ref ynbitikvkyocyozeinwv \
 *     --site-url https://www.playsportspool.com \
 *     --redirect https://www.playsportspool.com/** \
 *     [--redirect https://sports-pool.vercel.app/**] [--apply]
 *
 * Without --apply it only prints what would change. The token is read from
 * SUPABASE_ACCESS_TOKEN or the file named by SUPABASE_ACCESS_TOKEN_FILE and
 * is never printed.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const flags = (name: string): string[] => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));

const projectRef = flag("--project-ref");
const siteUrl = flag("--site-url");
const redirects = flags("--redirect");
const apply = args.includes("--apply");

if (!projectRef || !siteUrl) {
  console.error("usage: --project-ref <ref> --site-url <https://...> [--redirect <url-or-glob>]... [--apply]");
  process.exit(2);
}

const tokenFile = process.env.SUPABASE_ACCESS_TOKEN_FILE;
const token =
  process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
  (tokenFile && existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN (or SUPABASE_ACCESS_TOKEN_FILE) is required");
  process.exit(2);
}

const templatesDir = join(process.cwd(), "supabase", "templates");
const template = (name: string) => readFileSync(join(templatesDir, `${name}.html`), "utf8");

const desired: Record<string, unknown> = {
  site_url: siteUrl.replace(/\/$/, ""),
  uri_allow_list: [...new Set([`${siteUrl.replace(/\/$/, "")}/**`, ...redirects])].join(","),

  mailer_autoconfirm: false,
  mailer_subjects_confirmation: "Confirm your email – SportsPool",
  mailer_templates_confirmation_content: template("confirmation"),
  mailer_subjects_recovery: "Reset your SportsPool password",
  mailer_templates_recovery_content: template("recovery"),
  mailer_subjects_magic_link: "Your SportsPool sign-in link",
  mailer_templates_magic_link_content: template("magic_link"),
  mailer_subjects_email_change: "Confirm your new SportsPool email",
  mailer_templates_email_change_content: template("email_change"),
  mailer_subjects_invite: "You’re invited to SportsPool",
  mailer_templates_invite_content: template("invite"),
  mailer_subjects_reauthentication: "Your SportsPool verification code",
  mailer_templates_reauthentication_content: template("reauthentication"),

  mfa_totp_enroll_enabled: true,
  mfa_totp_verify_enabled: true,

  password_min_length: 10,
  password_required_characters: "abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789",
};

// Custom SMTP: only when every field is supplied, so a half-set never breaks mail.
const smtp = {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  admin: process.env.SMTP_ADMIN_EMAIL,
  sender: process.env.SMTP_SENDER_NAME ?? "SportsPool",
};
if (smtp.host && smtp.port && smtp.user && smtp.pass && smtp.admin) {
  Object.assign(desired, {
    smtp_host: smtp.host,
    smtp_port: Number(smtp.port),
    smtp_user: smtp.user,
    smtp_pass: smtp.pass,
    smtp_admin_email: smtp.admin,
    smtp_sender_name: smtp.sender,
  });
}

const SECRET_KEYS = new Set(["smtp_pass"]);
const api = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function main() {
  const current = await fetch(api, { headers });
  if (!current.ok) {
    throw new Error(`GET config failed: HTTP ${current.status} ${(await current.text()).slice(0, 200)}`);
  }
  const before = (await current.json()) as Record<string, unknown>;

  const changes: Array<[string, unknown, unknown]> = [];
  for (const [key, value] of Object.entries(desired)) {
    const prev = before[key];
    const same =
      typeof value === "string" && typeof prev === "string"
        ? value.replace(/\r\n/g, "\n").trim() === prev.replace(/\r\n/g, "\n").trim()
        : JSON.stringify(prev) === JSON.stringify(value);
    if (!same) changes.push([key, prev, value]);
  }

  const show = (key: string, v: unknown) =>
    SECRET_KEYS.has(key)
      ? "•••"
      : typeof v === "string" && v.length > 80
        ? `${v.slice(0, 60).replace(/\s+/g, " ")}… (${v.length} chars)`
        : JSON.stringify(v);

  console.log(`project ${projectRef}: ${changes.length} change(s)`);
  for (const [key, prev, next] of changes) console.log(`  ${key}: ${show(key, prev)} → ${show(key, next)}`);

  if (!apply) {
    console.log("dry run — re-run with --apply to write");
    return;
  }
  if (changes.length === 0) return;

  const patch = Object.fromEntries(changes.map(([k, , v]) => [k, v]));
  const res = await fetch(api, { method: "PATCH", headers, body: JSON.stringify(patch) });
  if (!res.ok) {
    throw new Error(`PATCH config failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const after = (await res.json()) as Record<string, unknown>;
  const stillOff = changes.filter(([k, , v]) => JSON.stringify(after[k] ?? null) !== JSON.stringify(v) && !(typeof v === "string" && typeof after[k] === "string" && (after[k] as string).trim() === v.trim()));
  console.log(stillOff.length === 0 ? "applied and verified" : `applied; ${stillOff.length} key(s) read back differently: ${stillOff.map(([k]) => k).join(", ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
