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
  ["Report date", "8 August 2026"],
  ["Application", "Next.js (App Router) API + Supabase (Postgres/RLS), Stripe, PayPal"],
  ["Scope", "Backend / server-side API routes, authorization, money-handling logic, RLS"],
  ["Assessment type", "White-box static security audit + logic-level attack simulation"],
  ["Repository", "markravencanete50-source/sports_pool"],
  ["Branch", "claude/backend-security-audit-vtkdog"],
  ["Result", "2 vulnerabilities found and fixed; 0 Critical/High remaining"],
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
children.push(H3("Findings at a glance"));
children.push(table(
  [520, 4300, 1200, 1200, 1580],
  ["#", "Finding", "Severity", "Status", "Location"],
  [
    ["F-1", "Open redirect in the OAuth / email-verification callback", { text: "Medium", fill: undefined }, { text: "Fixed" }, "auth/callback"],
    ["F-2", "PostgREST filter injection in admin user search", { text: "Low", fill: undefined }, { text: "Fixed" }, "admin/users"],
  ]
));
children.push(new Paragraph({ spacing: { after: 60 } }));
children.push(runs([T("Overall posture after remediation: ", { bold: true }), T("No Critical, High, or Medium severity issues outstanding. ", { color: GREEN, bold: true }), T("One informational recommendation (a latent lost-update in the settlement credit path) is noted for follow-up.")]));

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

// ---------------- Recommendations ----------------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("5. Recommendations (no action taken)"));
children.push(P("These are hardening opportunities, not exploited vulnerabilities. They are listed for the team to schedule; I did not change them to avoid destabilizing money-critical paths that cannot be tested in this environment."));
children.push(H3("R-1 — Latent lost-update in the settlement credit path (Informational)"));
children.push(runs([T("Location: ", { bold: true }), T("src/lib/materialize-winners.ts")]));
children.push(P("Unlike claim-payout and admin payout (which the team deliberately moved to atomic, relative balance math via RPCs), the settlement credit still reads the balance, computes previous_balance + amount in JavaScript, and writes the absolute result back. If a concurrent balance change (e.g. a user claim) lands between the read and the write, it would be clobbered. The window is narrow — settlement is a singleton cron — and per-pool credits are guarded against double-credit, so this is a latent robustness issue rather than an active exploit. Recommend routing this credit through the existing credit_user_balance RPC for consistency with the other two money paths."));
children.push(H3("R-2 — Authentication rate limiting"));
children.push(P("The sign-in and sign-up routes have no application-level rate limiting or lockout, leaving room for credential-stuffing and password-guessing against the platform. Recommend per-IP / per-account throttling (e.g. at the edge/middleware) and enabling Supabase's leaked-password protection when the plan allows (already noted in the signup validation comments)."));
children.push(H3("R-3 — Legacy picks endpoint hygiene"));
children.push(P("The legacy /cards/[cardId]/submit route writes to the older picks table, which is not used by settlement (settlement reads card_picks) and lacks the per-game kickoff lock the parlay path enforces. It cannot affect money today. Recommend removing the dead route (as was already done for the unpaid-card purchase route) to eliminate confusion and future footguns."));

// ---------------- Actions summary ----------------
children.push(H1("6. Summary of actions taken"));
children.push(bullet([T("Fixed F-1", { bold: true }), T(" (open redirect) in src/app/(auth)/auth/callback/route.ts — added same-origin path validation and an origin guard.")]));
children.push(bullet([T("Fixed F-2", { bold: true }), T(" (filter injection) in src/app/api/admin/users/route.ts — strip PostgREST filter metacharacters before interpolation.")]));
children.push(bullet("Verified both fixes with isolated proof-of-concept harnesses (all payloads neutralized; legitimate inputs preserved)."));
children.push(bullet([T("Committed", { bold: true }), T(' both fixes (commit e6b3b7f) and pushed to branch claude/backend-security-audit-vtkdog.')]));
children.push(bullet("Documented recommendations R-1..R-3 for follow-up; made no changes to untested money-critical paths."));
children.push(new Paragraph({ spacing: { before: 200 } }));
children.push(runs([T("Bottom line: ", { bold: true }), T("the platform's backend is in strong security shape. Two real issues were found and remediated; the money-handling core withstood every attack attempted against it.", { })]));

children.push(new Paragraph({ spacing: { before: 300 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 8 } },
  children: [new TextRun({ text: "Prepared by an automated authorized security assessment. Confidential — internal use only.", italics: true, size: 17, color: GREY })] }));

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
  fs.writeFileSync("/home/user/sports_pool/Backend_Security_Audit_Report.docx", buf);
  console.log("WROTE", buf.length, "bytes");
});
