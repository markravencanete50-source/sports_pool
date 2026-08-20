const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  PageBreak, TableOfContents, LevelFormat,
} = require("docx");
const fs = require("fs");

const NAVY = "1F3864";
const RED = "B22222";
const GREEN = "1E7A3E";
const AMBER = "B8860B";
const GREY = "595959";
const LIGHT = "F2F2F2";

const H1 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 140 } });
const H2 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 100 } });
const H3 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 80 } });

function P(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 120, line: 276 },
    children: [new TextRun({ text, size: 21, color: opts.color, bold: opts.bold, italics: opts.italics })],
  });
}
function runs(children, opts = {}) {
  return new Paragraph({ spacing: { after: opts.after ?? 120, line: 276 }, children });
}
function T(text, o = {}) {
  return new TextRun({ text, size: o.size ?? 21, bold: o.bold, italics: o.italics, color: o.color, font: o.font });
}
function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 80, line: 276 },
    children: Array.isArray(text) ? text : [new TextRun({ text, size: 21 })],
  });
}
function code(lines) {
  const arr = Array.isArray(lines) ? lines : [lines];
  return arr.map((ln, i) =>
    new Paragraph({
      spacing: { after: i === arr.length - 1 ? 120 : 0, line: 240 },
      shading: { type: ShadingType.CLEAR, fill: "F5F5F5" },
      border: {
        left: { style: BorderStyle.SINGLE, size: 12, color: "CCCCCC", space: 6 },
      },
      children: [new TextRun({ text: ln || " ", font: "Consolas", size: 18, color: "333333" })],
    })
  );
}

const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
};
function cell(children, { width, fill, header } = {}) {
  const kids = (Array.isArray(children) ? children : [children]).map((c) =>
    typeof c === "string"
      ? new Paragraph({ spacing: { after: 0, line: 260 }, children: [new TextRun({ text: c, size: 19, bold: header, color: header ? "FFFFFF" : undefined })] })
      : c
  );
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    borders: cellBorders,
    children: kids,
  });
}
function table(colWidths, headerCells, rows) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headerCells.map((h, i) => cell(h, { width: colWidths[i], fill: NAVY, header: true })),
      }),
      ...rows.map((r) =>
        new TableRow({
          children: r.map((c, i) =>
            Array.isArray(c) || typeof c === "object"
              ? cell(c.text ?? c, { width: colWidths[i], fill: c.fill })
              : cell(c, { width: colWidths[i] })
          ),
        })
      ),
    ],
  });
}
function sevCell(width, label, color) {
  return cell(
    new Paragraph({ spacing: { after: 0, line: 260 }, children: [new TextRun({ text: label, size: 19, bold: true, color })] }),
    { width }
  );
}

const children = [];

// ---------------- Cover ----------------
children.push(
  new Paragraph({ spacing: { before: 1600, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Backend Security Audit", bold: true, size: 56, color: NAVY })] }),
  new Paragraph({ spacing: { before: 120, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Penetration Test & Vulnerability Remediation Report", size: 30, color: GREY })] }),
  new Paragraph({ spacing: { before: 60, after: 600 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Gridiron — Sports Pool Platform", size: 24, italics: true, color: GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 10 } },
    spacing: { before: 200, after: 0 }, children: [new TextRun({ text: "", size: 2 })] }),
);
const meta = [
  ["Report date", "20 August 2026"],
  ["Supersedes", "Original assessment of 8 August 2026 (Vercel deployment only)"],
  ["Application", "Next.js (App Router) API + Supabase (Postgres/RLS), Stripe, PayPal"],
  ["Scope", "Backend / server-side API routes, authorization, money-handling logic, RLS"],
  ["Deployment shapes assessed", "Vercel (original) and self-hosted Docker on a VPS (this revision)"],
  ["Assessment type", "White-box static security audit + logic-level attack simulation"],
  ["Repository", "markravencanete50-source/sports_pool"],
  ["Branch", "claude/client-project-dev-hosrp1"],
  ["Result", "7 issues found and fixed across both rounds; 0 Critical/High remaining"],
];
children.push(new Paragraph({ spacing: { before: 300 } }));
children.push(table([2600, 6200], ["Field", "Detail"], meta.map(([a, b]) => [a, b])));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ---------------- TOC ----------------
children.push(H1("Contents"));
children.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ---------------- Executive summary ----------------
children.push(H1("1. Executive summary"));
children.push(P(
  "This report documents an authorized backend security assessment of the Gridiron sports-pool platform — a real-money application where users buy parlay-card entries, compete for a prize pot, and withdraw winnings. Because money moves through the system, the audit prioritized authentication, authorization, payment integrity, and data-access controls."
));
children.push(P(
  "The codebase was found to be, on the whole, unusually well-hardened: an extensive, adversarially-verified Row Level Security (RLS) migration makes the database the authorization boundary, payment fulfilment is server-authoritative through Stripe, and balance mutations are atomic. Against that strong baseline, the assessment identified two remaining vulnerabilities, both of which were fixed, verified, committed, and pushed during the engagement."
));
children.push(P(
  "This revision extends that work. The original assessment was scoped to a Vercel deployment and its conclusions were accurate for it. The platform has since been retargeted to a self-hosted Docker stack on a client-operated VPS, which is a materially different threat model: several controls in the original build inferred their trust boundary from Vercel-supplied environment signals that do not exist off that platform. Section 5 records a second round of assessment against the self-hosted shape, which found five further issues. All five were fixed, tested and pushed; two of them would have been business-critical on the first day of live operation."
));
children.push(H3("Findings at a glance"));
children.push(table(
  [520, 4300, 1200, 1200, 1580],
  ["#", "Finding", "Severity", "Status", "Location"],
  [
    ["F-1", "Open redirect in the OAuth / email-verification callback", { text: "Medium", fill: undefined }, { text: "Fixed" }, "auth/callback"],
    ["F-2", "PostgREST filter injection in admin user search", { text: "Low", fill: undefined }, { text: "Fixed" }, "admin/users"],
    ["S-1", "Geolocation trust inferred from Vercel, so all money actions refused off-platform", { text: "High", fill: undefined }, { text: "Fixed" }, "compliance/geo"],
    ["S-2", "Sandbox-payout guard inert off Vercel; real balances debitable against test money", { text: "High", fill: undefined }, { text: "Fixed" }, "lib/paypal"],
    ["S-3", "Reconciliation job absent from the self-hosted stack", { text: "Medium", fill: undefined }, { text: "Fixed" }, "docker-compose"],
    ["S-4", "Admin bootstrap reported success when it had done nothing", { text: "Low", fill: undefined }, { text: "Fixed" }, "api/seed-admin"],
    ["S-5", "Reconciliation filed a false incident daily while Stripe keys were unset", { text: "Low", fill: undefined }, { text: "Fixed" }, "api/cron/reconcile"],
  ]
));
children.push(new Paragraph({ spacing: { after: 60 } }));
children.push(runs([T("Overall posture after remediation: ", { bold: true }), T("No Critical, High, or Medium severity issues outstanding on either deployment shape. ", { color: GREEN, bold: true }), T("All three recommendations raised in the original report (R-1 to R-3) have since been implemented and are recorded as closed in section 6. One item remains genuinely open and is not a defect: the money path has not yet been exercised end to end against live Stripe test credentials, which is covered in section 5.3.")]));

// ---------------- Scope & methodology ----------------
children.push(H1("2. Scope & methodology"));
children.push(P("The assessment covered the server-side backend only. All 43 API route handlers under src/app/api plus the authentication callback route, the shared authorization/secret helpers, the money-handling libraries, and the database RLS migration were reviewed."));
children.push(H3("What I did"));
children.push(bullet("Enumerated every backend endpoint and classified each by risk (money movement, authentication, authorization, data exposure)."));
children.push(bullet("Performed white-box static analysis of each handler, tracing untrusted input from the request to the database or external service."));
children.push(bullet([T("Simulated attacks at the logic level against each endpoint, including: "), T("IDOR / broken object-level authorization", { italics: true }), T(" (accessing another user's cards, picks, payouts), "), T("privilege escalation", { italics: true }), T(" (self-promotion to admin, self-settling a pool), "), T("price / amount tampering", { italics: true }), T(" (client-supplied entry fees and payout amounts), "), T("payment-flow abuse", { italics: true }), T(" (free cards, double-fulfilment, session hijack), "), T("open redirect", { italics: true }), T(", and "), T("injection", { italics: true }), T(" (SQL/PostgREST filter, LIKE-wildcard).")]));
children.push(bullet("Reviewed the RLS policy set as the second line of defence, on the assumption that any API bug must not by itself be sufficient to leak or move money."));
children.push(bullet("For each confirmed issue, reproduced the vulnerable behaviour in an isolated test harness, implemented a fix, and re-ran the harness to prove the exploit no longer works."));
children.push(new Paragraph({ spacing: { after: 40 } }));
children.push(runs([T("Note on dynamic testing. ", { bold: true }), T("This environment has no running application instance, database, or third-party credentials, and project dependencies were not installed. Attacks were therefore executed as logic-level and code-path analysis with isolated proof-of-concept harnesses, rather than as live HTTP traffic against a deployed target. Findings were verified by exact code tracing and reproduction of the vulnerable primitive in Node.", { italics: true })]));

// ---------------- Findings ----------------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("3. Detailed findings"));

// F-1
children.push(H2("F-1 — Open redirect in the authentication callback"));
children.push(table(
  [1800, 7000],
  ["Attribute", "Value"],
  [
    [{ text: "Severity" }, { text: "Medium (CWE-601: URL Redirection to Untrusted Site)" }],
    ["Location", "src/app/(auth)/auth/callback/route.ts"],
    ["Status", { text: "Fixed & verified" }],
    ["Vector", "Unauthenticated — crafted link sent to a victim"],
  ]
));
children.push(H3("Description"));
children.push(P("The callback that completes Supabase authentication (email verification / OAuth code exchange) read a next query parameter and used it to build the post-login redirect target with no validation:"));
children.push(...code([
  'const nextUrl = searchParams.get("next") ?? DASHBOARD_PATH;',
  '// ...',
  'const url = new URL(nextUrl, request.url);   // <-- attacker-controlled',
  'return NextResponse.redirect(url);',
]));
children.push(P("Because new URL() treats an absolute or scheme-relative value as a full URL, a next value pointing off-site resolves to an attacker-controlled origin."));
children.push(H3("Attack performed"));
children.push(P("I supplied a malicious next parameter and resolved the redirect target exactly as the handler did:"));
children.push(...code([
  'GET /auth/callback?code=<valid>&next=https://evil.com/phish',
  '',
  '// Resolved redirect target (pre-fix):',
  'https://evil.com/phish?verified=1        <-- OFF-SITE',
]));
children.push(P("A victim who clicks a legitimate-looking link to the real application domain is silently forwarded to the attacker's page immediately after authenticating — a high-credibility phishing primitive on a trusted domain (e.g. a cloned login prompting for the password or payout details). Scheme-relative (//evil.com) and backslash (/\\evil.com) variants resolve the same way."));
children.push(H3("Fix applied"));
children.push(P("The next value is now accepted only as a same-origin, path-relative destination (single leading slash, never // or /\\), the final URL is built against the request origin, and a defence-in-depth origin check forces the dashboard if the resolved origin ever differs:"));
children.push(...code([
  'function safeNextPath(raw) {',
  '  if (!raw) return DASHBOARD_PATH;',
  '  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\\\"))',
  '    return DASHBOARD_PATH;',
  '  return raw;',
  '}',
  '// ...',
  'const url = new URL(nextPath, requestUrl.origin);',
  'if (url.origin !== requestUrl.origin)',
  '  return NextResponse.redirect(new URL(DASHBOARD_PATH, requestUrl.origin));',
]));
children.push(H3("Verification"));
children.push(P("A test harness ran 11 payloads through the fixed logic. Every external/malicious payload was neutralised to the same-origin dashboard; every legitimate relative path was preserved:"));
children.push(...code([
  '"https://evil.com"        -> .../dashboard?verified=1        same-origin',
  '"//evil.com"              -> .../dashboard?verified=1        same-origin',
  '"/\\evil.com"             -> .../dashboard?verified=1        same-origin',
  '"javascript:alert(1)"     -> .../dashboard?verified=1        same-origin',
  '"/my-games/withdrawals"   -> .../my-games/withdrawals?...    same-origin (kept)',
  '',
  'ALL REDIRECTS SAME-ORIGIN: PASS',
]));

// F-2
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H2("F-2 — PostgREST filter injection in admin user search"));
children.push(table(
  [1800, 7000],
  ["Attribute", "Value"],
  [
    [{ text: "Severity" }, { text: "Low (CWE-943: Improper Neutralization in a Data Query)" }],
    ["Location", "src/app/api/admin/users/route.ts"],
    ["Status", { text: "Fixed & verified" }],
    ["Vector", "Authenticated admin only (no privilege escalation)"],
  ]
));
children.push(H3("Description"));
children.push(P("The admin user-search endpoint escaped LIKE wildcards (% and _) but interpolated the search term directly into a PostgREST .or() filter expression. The structural metacharacters of that filter mini-language — the comma that separates filters and the parentheses that open a nested logic group — were not neutralized:"));
children.push(...code([
  'const term = search.replace(/%/g, "\\\\%").replace(/_/g, "\\\\_");',
  'query = query.or(`email.ilike.%${term}%,name.ilike.%${term}%`);',
]));
children.push(P("A term such as ,role.eq.admin) could graft additional filter clauses onto the query. Impact is limited: the route is gated by requireAdmin(), and it reads only the users table columns an admin is already entitled to see, so this enables neither privilege escalation nor cross-table access. It is reported and fixed as defence-in-depth and to prevent regression if the query is later broadened."));
children.push(H3("Fix applied"));
children.push(P("Structural metacharacters (comma, parentheses, quotes, backslash) are stripped before the LIKE wildcards are escaped and the term is interpolated:"));
children.push(...code([
  'const term = search',
  '  .replace(/[,()"\\\\]/g, " ")',
  '  .replace(/%/g, "\\\\%")',
  '  .replace(/_/g, "\\\\_");',
  'query = query.or(`email.ilike.%${term}%,name.ilike.%${term}%`);',
]));

// ---------------- Attacks that failed ----------------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("4. Attacks attempted that the system withstood"));
children.push(P("The following attack classes were tested against the relevant endpoints and were correctly defended, in most cases at both the API and database (RLS) layers. This is where the bulk of the assessment time went, and where the codebase's existing hardening held up."));
children.push(table(
  [3100, 4100, 1600],
  ["Attack attempted", "Why it failed (control in place)", "Result"],
  [
    ["Free / unpaid parlay cards", "Legacy self-serve purchase route returns 410; all entries must clear Stripe Checkout, amount derived server-side from the pool", { text: "Blocked" }],
    ["Entry-fee tampering (pay $20 for a $500 pool)", "Checkout uses the pool's authoritative entry_fee; client value only cross-checked, never trusted; webhook re-verifies amount_total", { text: "Blocked" }],
    ["Double card fulfilment (race webhook vs return page)", "Two-layer idempotency: pre-insert lookup + UNIQUE(stripe_session_id)", { text: "Blocked" }],
    ["Confirm another user's Stripe session", "session.metadata.userId must equal the caller", { text: "Blocked" }],
    ["Self-promotion to admin via profile update", "RLS with_check pins role and balance to their current values", { text: "Blocked" }],
    ["Rewrite a game's final score to decide the pot", "Admin-only route + admin-only RLS on games + non-negative score constraint", { text: "Blocked" }],
    ["Self-settle a pool to trigger a payout", "Pool status writes are admin-only; status column unwritable by any client session", { text: "Blocked" }],
    ["Read opponents' cards / picks before kickoff", "Card-holder-only RLS; no permissive OR policy remains; API also binds card to caller", { text: "Blocked" }],
    ["Submit a pick after kickoff (known result)", "Per-game kickoff lock in API and mirrored in RLS (game must be scheduled and future)", { text: "Blocked" }],
    ["Queue a withdrawal exceeding balance", "Balance check in API + RLS insert check amount <= caller balance; atomic debit on approval", { text: "Blocked" }],
    ["Drain float via concurrent payout approvals", "Atomic debit_user_balance (single conditional UPDATE) reserves funds before PayPal", { text: "Blocked" }],
    ["Lost-update on balance via concurrent claim", "claim_pool_payout runs in one DB transaction with row lock; relative balance math", { text: "Blocked" }],
    ["Join / read a private pool by self-inserting", "pool_participants insert check requires public pool or accepted invitation", { text: "Blocked" }],
    ["Harvest all users' email / balance / admin flag", "World-readable users policy removed; own-profile-only + admin; public_profiles view exposes name/avatar only", { text: "Blocked" }],
    ["Trigger settlement / admin bootstrap anonymously", "Cron & setup routes fail closed on unset secret; timing-safe secret comparison", { text: "Blocked" }],
    ["Forge a Stripe webhook", "Signature verified over raw body against STRIPE_WEBHOOK_SECRET; fails closed if unset", { text: "Blocked" }],
    ["SSRF / prompt injection via chat moderation", "Fixed provider URL; user text is a classification target, not an instruction; fails closed", { text: "Blocked" }],
  ]
));

// ---------------- Self-hosted deployment assessment ----------------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("5. Self-hosted (VPS) deployment assessment"));
children.push(P("The platform was originally built and audited for Vercel. It is now being deployed to a Docker stack on a client-operated VPS, with Cloudflare terminating inbound traffic. The VPS runs the application and its two scheduled jobs; the database remains on managed Supabase, for the reasons in 5.5. That change moves the trust boundary, and several controls turned out to be reading their trust signal from the platform rather than from configuration under our control."));
children.push(P("This is the failure mode worth naming plainly, because it recurs: a control that asks \"am I on Vercel?\" is not asking \"am I behind a trusted edge?\". On Vercel the two questions have the same answer, so the distinction is invisible until the deployment target changes. Each finding below is an instance of it."));

children.push(H2("5.1 Findings"));

children.push(H3("S-1 — Geolocation trust inferred from the hosting platform (High, fixed)"));
children.push(runs([T("Location: ", { bold: true }), T("src/lib/compliance/geo.ts, src/proxy.ts")]));
children.push(P("The compliance gate refuses money actions when it cannot establish the user's jurisdiction, which is the correct fail-closed posture. Location was resolved only from Vercel's edge headers, gated on the VERCEL environment variable. Off Vercel that variable is absent, so every request resolved to an unknown location, and with geo enforcement enabled (the database default) every purchase, deposit and payout would have been refused in production."));
children.push(P("The user-visible symptom is the dangerous part: the site serves normally, sign-up works, pools render, and nothing appears in the error log, because a fail-closed compliance refusal is a correct outcome rather than a fault. The platform would simply have taken no money, and the cause would not have been obvious from any dashboard."));
children.push(runs([T("Remediation: ", { bold: true }), T("Cloudflare's cf-ipcountry and cf-region-code are now honoured under the same explicit contract the rate limiter already used, TRUSTED_PROXY=cloudflare, so trust is declared by our configuration rather than inferred from the host. Cloudflare's XX and T1 sentinel values resolve to unknown rather than being read as countries. Spoofed headers still gain nothing when no trusted edge is declared, which is covered by regression tests. The health endpoint now reports the no-trusted-edge state explicitly so the silent no-sales condition is visible from a single request.")]));

children.push(H3("S-2 — Sandbox-payout guard inert off Vercel (High, fixed)"));
children.push(runs([T("Location: ", { bold: true }), T("src/lib/paypal.ts")]));
children.push(P("A guard exists to prevent a production deployment paying out against PayPal sandbox, which would debit a real user balance and send money that does not exist. It identified production by VERCEL_ENV, which is never set outside Vercel, so on the VPS the guard could not fire. The self-hosted deployment was therefore the one environment where the control was absent and no other layer would have caught it."));
children.push(runs([T("Remediation: ", { bold: true }), T("Production is now determined by VERCEL_ENV where the platform supplies it and NODE_ENV otherwise. Because a self-hosted build is NODE_ENV=production even during sandbox testing, an explicit ALLOW_SANDBOX_PAYOUTS opt-out covers the test window; it accepts only the literal value true, is logged loudly whenever it takes effect, and is reported by the health endpoint. Four regression tests pin the behaviour across VPS production, the test-window opt-out, Vercel preview and live mode.")]));

children.push(H3("S-3 — Reconciliation absent from the self-hosted stack (Medium, fixed)"));
children.push(runs([T("Location: ", { bold: true }), T("docker-compose.yml")]));
children.push(P("Two scheduled jobs ran on Vercel: settlement, which pays winners, and reconciliation, which cross-checks Stripe's records against the internal ledger and files any divergence for review. The compose stack shipped a scheduler for settlement only. A self-hosted deployment would therefore have paid pools out correctly while silently losing the detective control that catches a charged player who received no card, a ledger row with no matching payment, or a completed payout with no traceable batch. The same job performs error-log retention, so that would also have stopped."));
children.push(runs([T("Remediation: ", { bold: true }), T("A reconcile-cron service now mirrors the settlement scheduler at the daily cadence the route's look-back window is sized for. Both jobs are part of the stack rather than something an operator must remember to add.")]));

children.push(H3("S-4 — Admin bootstrap reported success on a no-op (Low, fixed)"));
children.push(runs([T("Location: ", { bold: true }), T("src/app/api/seed-admin/route.ts")]));
children.push(P("The one-time bootstrap endpoint answered 200 with a success body in cases where it had done nothing at all, including when the target email was not configured and when no account matching it had registered yet. An operator provisioning a new environment would reasonably read that as a completed bootstrap, then remove the setup secret, and discover only later that no administrator existed."));
children.push(runs([T("Remediation: ", { bold: true }), T("The endpoint now distinguishes its outcomes: 503 when the target email is unconfigured, 409 when that account has not yet registered, and 200 only when an administrator actually exists. The caller has already proven possession of the setup secret, so precise outcomes disclose nothing to an unauthenticated party. The endpoint continues to refuse permanently once any administrator exists.")]));

children.push(H3("S-5 — False reconciliation incidents while payment keys are unset (Low, fixed)"));
children.push(runs([T("Location: ", { bold: true }), T("src/app/api/cron/reconcile/route.ts")]));
children.push(P("The reconciliation job constructed a Stripe client unconditionally, which throws while the secret key is unset. During the handover window, when the client legitimately holds the payment credentials and the platform does not yet have them, every scheduled run recorded a reconciliation failure. An alerting channel that reports a routine configuration state as a daily incident is one an operator learns to ignore, which defeats the purpose of the control at the moment it matters."));
children.push(runs([T("Remediation: ", { bold: true }), T("The Stripe comparisons are skipped with a named warning in both the log and the response body when no key is configured, while the payout-traceability check and retention purge continue to run. A missing key is now reported as a missing key rather than as a failure.")]));

children.push(H2("5.2 Verification"));
children.push(P("All five fixes were verified before release: static type checking, the full linting rule set, the unit suite (61 tests, including 8 added to cover these paths), the settlement invariant sweep across 243 payout combinations, the migration and documentation guards, and a production build. Eight regression tests specifically pin the two High-severity behaviours, including the adversarial cases where a forged location header must gain the attacker nothing."));

children.push(H2("5.3 Open item"));
children.push(P("One item remains open and is not a code defect. The money path is built, statically audited and unit-verified, but it has not been exercised end to end against live Stripe test-mode credentials, because those credentials have not yet been issued to the project. Until that run is completed, the payment integration is verified by construction and by test double rather than by observation."));
children.push(P("This is the recommended final gate before accepting real money. It is a short exercise once credentials exist: a test purchase through Stripe Checkout, confirmation that the card is issued by the webhook rather than the browser redirect, a settlement run, and a sandbox payout, followed by a reconciliation run that reports no divergence."));

children.push(H2("5.4 Operational dependencies"));
children.push(P("Two configuration values are load-bearing for correctness on the self-hosted stack and are worth stating explicitly to whoever operates the server, because in both cases the failure is silent rather than noisy:"));
children.push(bullet([T("TRUSTED_PROXY=cloudflare", { bold: true }), T(" must be set while the stack sits behind the Cloudflare tunnel. Without it, location cannot be established and every payment is refused, while the site otherwise appears healthy. It must not be set if the origin is ever reachable directly, since the header would then be attacker-supplied.")]));
children.push(bullet([T("CRON_SECRET", { bold: true }), T(" must be set, or both scheduled jobs refuse to run. This is deliberate: the endpoints fail closed, so an unset secret means no settlement rather than settlement exposed to anonymous callers. The consequence is that nobody is paid until it is configured.")]));
children.push(P("The health endpoint reports the state of both, along with payment credentials, database connectivity and the rate-limiting backend. A single authenticated request to it answers whether the deployment is fully provisioned."));

children.push(H2("5.5 Database placement"));
children.push(P("The container stack is capable of running its own Postgres, authentication service, REST gateway and realtime service alongside the application, and did so by default. Following the deployment documentation as written would therefore have relocated the money ledger onto the VPS. That was assessed and rejected, and the default was changed so the bundled database is now opt-in."));
children.push(P("The reasoning is a security one rather than a preference. Managed Supabase retains daily backups on every plan and offers point-in-time recovery as a purchasable setting; a Postgres container writing to a directory on the host has neither until an operator builds, schedules and rehearses a backup procedure themselves. The data in question is an append-only financial ledger which the dispute process treats as the record of authority, and which cannot be reconstructed from any other source. A deployment whose backup posture depends on a task nobody has been assigned is not a backup posture."));
children.push(P("Two lesser factors point the same way. Self-hosting transfers responsibility for Postgres and authentication-service vulnerability patching to whoever administers the server, and the authentication service is a component where a delayed patch is a direct exposure. It also discards a database that was already provisioned and verified against the structural money-guard checks, reopening a window in which a provisioning error passes unnoticed."));
children.push(P("Nothing in the authorization model depends on this choice. Row Level Security is defined in the schema and enforced by Postgres wherever it runs, so the boundary is identical either way. The decision concerns durability and maintenance burden, not access control."));


// ---------------- Recommendations ----------------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("6. Recommendations from the original assessment (all now closed)"));
children.push(P("These were raised as hardening opportunities in the 8 August report rather than exploited vulnerabilities, and were left unchanged at the time to avoid destabilizing money-critical paths that could not be tested in that environment. All three have since been implemented and verified. They are retained here so the record shows what was raised and how it was resolved."));
children.push(H3("R-1 — Latent lost-update in the settlement credit path (Informational) — CLOSED"));
children.push(runs([T("Location: ", { bold: true }), T("src/lib/materialize-winners.ts")]));
children.push(P("Unlike claim-payout and admin payout (which the team deliberately moved to atomic, relative balance math via RPCs), the settlement credit still reads the balance, computes previous_balance + amount in JavaScript, and writes the absolute result back. If a concurrent balance change (e.g. a user claim) lands between the read and the write, it would be clobbered. The window is narrow — settlement is a singleton cron — and per-pool credits are guarded against double-credit, so this is a latent robustness issue rather than an active exploit. Recommend routing this credit through the existing credit_user_balance RPC for consistency with the other two money paths."));
children.push(runs([T("Resolution: ", { bold: true, color: GREEN }), T("Implemented as recommended. The settlement credit now moves the balance through the credit_user_balance RPC as a single atomic relative increment, matching the claim-payout and admin-payout paths. The read-modify-write window no longer exists.")]));
children.push(H3("R-2 — Authentication rate limiting — CLOSED"));
children.push(P("The sign-in and sign-up routes have no application-level rate limiting or lockout, leaving room for credential-stuffing and password-guessing against the platform. Recommend per-IP / per-account throttling (e.g. at the edge/middleware) and enabling Supabase's leaked-password protection when the plan allows (already noted in the signup validation comments)."));
children.push(runs([T("Resolution: ", { bold: true, color: GREEN }), T("Implemented. Both the sign-in and sign-up routes now enforce rate limits, backed by Upstash Redis where provisioned and by an in-memory limiter otherwise. Client identification deliberately avoids the client-supplied leftmost forwarded-for value, which would have allowed an attacker to place every request in its own bucket. Breached-password checking against the Have I Been Pwned range API is also in place, failing open so that an outage at that service cannot block legitimate sign-ups.")]));
children.push(H3("R-3 — Legacy picks endpoint hygiene — CLOSED"));
children.push(P("The legacy /cards/[cardId]/submit route writes to the older picks table, which is not used by settlement (settlement reads card_picks) and lacks the per-game kickoff lock the parlay path enforces. It cannot affect money today. Recommend removing the dead route (as was already done for the unpaid-card purchase route) to eliminate confusion and future footguns."));
children.push(runs([T("Resolution: ", { bold: true, color: GREEN }), T("Implemented. The route now returns 410 and names the correct endpoint, so any straggler caller fails loudly rather than writing picks that would never be scored, and the legacy picks table has been dropped from the schema by migration.")]));

// ---------------- Actions summary ----------------
children.push(H1("7. Summary of actions taken"));
children.push(H3("Original assessment (8 August 2026)"));
children.push(bullet([T("Fixed F-1", { bold: true }), T(" (open redirect) in src/app/(auth)/auth/callback/route.ts, adding same-origin path validation and an origin guard.")]));
children.push(bullet([T("Fixed F-2", { bold: true }), T(" (filter injection) in src/app/api/admin/users/route.ts, stripping PostgREST filter metacharacters before interpolation.")]));
children.push(bullet("Verified both fixes with isolated proof-of-concept harnesses; all payloads neutralized, legitimate inputs preserved."));
children.push(bullet("Documented recommendations R-1 to R-3 for follow-up, making no changes to untested money-critical paths at that time."));
children.push(H3("Since the original assessment"));
children.push(bullet("Implemented all three recommendations (R-1 atomic settlement credit, R-2 authentication rate limiting and breached-password checking, R-3 legacy pick route removal and table drop)."));
children.push(H3("Self-hosted deployment assessment (20 August 2026)"));
children.push(bullet([T("Fixed S-1", { bold: true }), T(" by resolving geolocation from a declared trusted edge rather than an inferred hosting platform, restoring the ability to take payment on the self-hosted stack without weakening the anti-spoofing property.")]));
children.push(bullet([T("Fixed S-2", { bold: true }), T(" by making the sandbox-payout guard fire on any production build, with an explicit and logged opt-out for the testing window.")]));
children.push(bullet([T("Fixed S-3", { bold: true }), T(" by adding the reconciliation scheduler to the container stack, restoring the detective control over payment-to-ledger divergence.")]));
children.push(bullet([T("Fixed S-4 and S-5", { bold: true }), T(", so that the administrator bootstrap reports honestly and reconciliation distinguishes an unconfigured payment processor from a failure.")]));
children.push(bullet("Verified the full set against type checking, linting, 61 unit tests, the 243-combination settlement sweep, the migration and documentation guards, and a production build."));
children.push(new Paragraph({ spacing: { before: 200 } }));
children.push(runs([T("Bottom line: ", { bold: true }), T("the platform's backend is in strong security shape on both deployment shapes. Seven issues have been found and remediated across the two rounds, and the money-handling core withstood every attack attempted against it. The controls that failed on the move to self-hosting failed safely in every case except one, S-2, which is the finding worth remembering: a guard that identifies its environment by asking which vendor is hosting it will be absent precisely when the vendor changes. The remaining gate before live operation is not a defect but an exercise, namely the end-to-end payment run described in section 5.3.", { })]));

children.push(new Paragraph({ spacing: { before: 300 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 8 } },
  children: [new TextRun({ text: "Prepared as an authorized security assessment for the owner of the Gridiron platform. Confidential: contains defensive control detail and should be shared only with parties operating or auditing this system.", italics: true, size: 17, color: GREY })] }));

// Exported so scripts/gen-combined-doc.cjs can assemble every document into one
// deliverable without duplicating a single line of this content. Running this file
// directly still writes its own .docx exactly as before.
if (require.main !== module) { module.exports = children; return; }

const doc = new Document({
  creator: "Security Audit",
  title: "Backend Security Audit Report — Gridiron",
  description: "Authorized backend penetration test and remediation report",
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 920, hanging: 260 } } } },
      ]},
    ],
  },
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 21, color: "222222" } },
    },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Calibri", size: 30, bold: true, color: NAVY },
        paragraph: { spacing: { before: 280, after: 140 }, keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Calibri", size: 25, bold: true, color: "2E4A7A" },
        paragraph: { spacing: { before: 220, after: 100 }, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Calibri", size: 22, bold: true, color: "3A3A3A" },
        paragraph: { spacing: { before: 160, after: 70 }, keepNext: true } },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, bottom: 1200, left: 1300, right: 1300 } } },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(process.argv[2] || "Backend_Security_Audit_Report.docx", buf);
  console.log("WROTE", buf.length, "bytes");
});
