const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  PageBreak, LevelFormat, convertInchesToTwip, Header, Footer, PageNumber,
} = require("docx");
const fs = require("fs");

// ── Layout constants ────────────────────────────────────────────────────────
const CONTENT = 9360;            // US Letter 12240 - 2*1440 margins
const NAVY = "1F3864";
const SLATE = "44546A";
const RULE = "C9CFD9";

const SEV = {
  Critical: { bg: "F8D7DA", fg: "842029" },
  High:     { bg: "FFE0CC", fg: "8A3D00" },
  Medium:   { bg: "FFF3CD", fg: "664D03" },
  Low:      { bg: "E2E8DE", fg: "3F5142" },
  Pass:     { bg: "D1E7DD", fg: "0F5132" },
  Info:     { bg: "E7EBF0", fg: "3C4A5A" },
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const P = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: opts.after ?? 120, line: 276 },
    alignment: opts.align,
    children: [new TextRun({
      text, size: opts.size ?? 21, color: opts.color ?? "1A1A1A",
      bold: opts.bold, italics: opts.italics, font: "Calibri",
    })],
  });

const Rich = (runs, opts = {}) =>
  new Paragraph({
    spacing: { after: opts.after ?? 120, line: 276 },
    children: runs.map(r =>
      new TextRun({
        text: r.t, bold: r.b, italics: r.i, size: r.size ?? 21,
        color: r.c ?? "1A1A1A", font: r.mono ? "Consolas" : "Calibri",
      })),
  });

const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 180 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 6 } },
  children: [new TextRun({ text, size: 32, bold: true, color: NAVY, font: "Calibri" })],
});

const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 280, after: 140 },
  children: [new TextRun({ text, size: 26, bold: true, color: NAVY, font: "Calibri" })],
});

const H3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 200, after: 100 },
  children: [new TextRun({ text, size: 22, bold: true, color: SLATE, font: "Calibri" })],
});

const Bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: "bullets", level },
  spacing: { after: 80, line: 276 },
  children: [new TextRun({ text, size: 21, font: "Calibri" })],
});

const cell = (children, { w, bg, span, valign } = {}) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  columnSpan: span,
  shading: bg ? { type: ShadingType.CLEAR, fill: bg, color: "auto" } : undefined,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  verticalAlign: valign,
  children,
});

const txtCell = (text, { w, bg, bold, color, size, align } = {}) =>
  cell([new Paragraph({
    alignment: align,
    spacing: { after: 0, line: 260 },
    children: [new TextRun({
      text: String(text), bold, size: size ?? 19,
      color: color ?? "1A1A1A", font: "Calibri",
    })],
  })], { w, bg });

const headerRow = (labels, widths) => new TableRow({
  tableHeader: true,
  children: labels.map((l, i) =>
    txtCell(l, { w: widths[i], bg: NAVY, bold: true, color: "FFFFFF" })),
});

const table = (widths, rows) => new Table({
  columnWidths: widths,
  width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  borders: {
    top:              { style: BorderStyle.SINGLE, size: 4, color: RULE },
    bottom:           { style: BorderStyle.SINGLE, size: 4, color: RULE },
    left:             { style: BorderStyle.SINGLE, size: 4, color: RULE },
    right:            { style: BorderStyle.SINGLE, size: 4, color: RULE },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    insideVertical:   { style: BorderStyle.SINGLE, size: 4, color: RULE },
  },
  rows,
});

// Findings table: ID | Finding | Severity | Status
const findingsTable = (rows) => {
  const w = [780, 5200, 1180, 2200];
  return table(w, [
    headerRow(["ID", "Finding", "Severity", "Status"], w),
    ...rows.map(r => new TableRow({
      children: [
        txtCell(r.id, { w: w[0], bold: true }),
        txtCell(r.finding, { w: w[1] }),
        txtCell(r.sev, { w: w[2], bg: SEV[r.sev].bg, color: SEV[r.sev].fg, bold: true, align: AlignmentType.CENTER }),
        txtCell(r.status, { w: w[3] }),
      ],
    })),
  ]);
};

// Checklist table: ☐ | Requirement | Why it matters | Priority
const checklist = (rows) => {
  const w = [420, 3300, 4060, 1580];
  return table(w, [
    headerRow(["", "Requirement", "Why it matters", "Priority"], w),
    ...rows.map(r => new TableRow({
      children: [
        txtCell("☐", { w: w[0], size: 24, align: AlignmentType.CENTER }),
        txtCell(r.req, { w: w[1], bold: true }),
        txtCell(r.why, { w: w[2] }),
        txtCell(r.pri, { w: w[3], bg: SEV[r.pri].bg, color: SEV[r.pri].fg, bold: true, align: AlignmentType.CENTER }),
      ],
    })),
  ]);
};

const kvTable = (rows, leftW = 3000) => {
  const w = [leftW, CONTENT - leftW];
  return table(w, rows.map(r => new TableRow({
    children: [
      txtCell(r[0], { w: w[0], bold: true, bg: "F2F5F9" }),
      txtCell(r[1], { w: w[1] }),
    ],
  })));
};

const spacer = (h = 120) => new Paragraph({ spacing: { after: h }, children: [] });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

// ── Document content ────────────────────────────────────────────────────────
const children = [];

// Cover
children.push(
  new Paragraph({ spacing: { before: 2200, after: 0 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: "GRIDIRON / SPORTS POOL", size: 24, bold: true, color: SLATE, font: "Calibri", characterSpacing: 60 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 120 },
    children: [new TextRun({ text: "Full-Stack Audit", size: 60, bold: true, color: NAVY, font: "Calibri" })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 480 },
    children: [new TextRun({ text: "Frontend, Backend, Database & Operational Readiness", size: 26, color: SLATE, font: "Calibri" })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 10 } },
    spacing: { after: 200 }, children: [],
  }),
);

children.push(kvTable([
  ["Repository", "markravencanete50-source/sports_pool"],
  ["Audited commit", "49d074e (main), remediated on branch claude/security-reliability-audit-umo1s5"],
  ["Supabase project", "veughegjwzsbjgcueyka"],
  ["Production", "sports-pool (Vercel) — deploy READY"],
  ["Audit date", "12 August 2026 — findings and remediation, same cycle"],
  ["Data state at audit", "Pre-launch: 0 users, 0 pools, 0 cards, 0 transactions"],
  ["Verdict", "All Medium and Low findings closed and verified. Three Highs remain, all requiring external accounts, credentials or decisions — see Section 9.A."],
], 2600));

children.push(pageBreak());

// Contents
children.push(H1("Contents"));
[
  "1.  Executive summary",
  "2.  Scope and method",
  "3.  System overview",
  "4.  Frontend audit",
  "5.  Backend audit",
  "6.  Database audit",
  "7.  Infrastructure and operations",
  "8.  Risk register",
  "9.  Checklists — lacking requirements",
  "10. Appendix A — API route inventory",
  "11. Appendix B — what this audit cycle fixed",
].forEach(t => children.push(P(t, { size: 22, after: 90 })));

children.push(pageBreak());

// ── 1. Executive summary ────────────────────────────────────────────────────
children.push(H1("1.  Executive summary"));

children.push(P(
  "This is a real-money contest platform: users pay an entry fee through Stripe, receive parlay cards, make picks against NFL fixtures, and a settlement engine splits the pot — less a platform fee — into winners' balances, which are withdrawn via PayPal. That makes correctness and authorization non-negotiable in a way an ordinary CRUD app never faces: a defect here does not corrupt data, it moves money."
));

children.push(P(
  "The application has been through several hardening cycles, and it shows. The money paths are defended in depth: purchase amounts derive from the Stripe session rather than the client, the webhook verifies its signature before parsing, fulfilment and payout completion are both idempotent, settlement credits balances through an atomic RPC, and two legacy endpoints that could issue free paid cards or write picks the scoring engine never reads have been retired as explicit 410s rather than quietly deleted. Row-level security is enabled on every public table, and column-level grants — not just policies — now stand between an ordinary account and its own balance."
));

children.push(P(
  "The 2026-08-12 remediation cycle closed every Medium and Low finding this audit had recorded, and four of the seven Highs. Error boundaries, client error reporting into a service-role-only error table, structured JSON logging on the money paths, a daily Stripe/PayPal reconciliation job, hourly settlement, an incident runbook with a documented backup and restore-rehearsal procedure, zod validation on every route that accepts input, an app-level breached-password check at signup, a blocking accessibility lint gate, complete page metadata with sitemap and robots, loading boundaries, and consolidated RLS policies all landed and were verified against the live database and the full CI gate. What remains open are three items that code alone cannot close — they need accounts, credentials or a product decision, and they are listed below."
));

children.push(H3("Headline numbers"));
{
  const w = [2340, 2340, 2340, 2340];
  children.push(table(w, [
    new TableRow({ children: [
      txtCell("46", { w: w[0], bg: "F2F5F9", bold: true, size: 30, align: AlignmentType.CENTER }),
      txtCell("29", { w: w[1], bg: "F2F5F9", bold: true, size: 30, align: AlignmentType.CENTER }),
      txtCell("3", { w: w[2], bg: SEV.High.bg, bold: true, size: 30, color: SEV.High.fg, align: AlignmentType.CENTER }),
      txtCell("3", { w: w[3], bg: SEV.Medium.bg, bold: true, size: 30, color: SEV.Medium.fg, align: AlignmentType.CENTER }),
    ]}),
    new TableRow({ children: [
      txtCell("API routes", { w: w[0], bg: "F2F5F9", align: AlignmentType.CENTER }),
      txtCell("DB migrations", { w: w[1], bg: "F2F5F9", align: AlignmentType.CENTER }),
      txtCell("High-severity open risks", { w: w[2], bg: SEV.High.bg, color: SEV.High.fg, align: AlignmentType.CENTER }),
      txtCell("Open findings total", { w: w[3], bg: SEV.Medium.bg, color: SEV.Medium.fg, align: AlignmentType.CENTER }),
    ]}),
  ]));
}

children.push(spacer(160));
children.push(H3("The three findings that should gate launch"));

children.push(Rich([
  { t: "1.  Rate limiting is not actually distributed. ", b: true },
  { t: "The limiter supports Upstash Redis and falls back to an in-memory window when " },
  { t: "UPSTASH_REDIS_REST_URL", mono: true }, { t: " and " },
  { t: "UPSTASH_REDIS_REST_TOKEN", mono: true },
  { t: " are unset. They are unset. On Vercel each serverless instance therefore keeps its own counter, so the effective limit on sign-in — the credential-stuffing defence — is the configured limit multiplied by however many instances are warm. This is a two-minute fix with a disproportionate payoff." },
]));

children.push(Rich([
  { t: "2.  No end-to-end verification of the money path. ", b: true },
  { t: "The settlement mathematics has a genuine regression suite (243 combinations, cent-exact). The path around it — Stripe Checkout → webhook → card issued → picks → scoring → balance credit → PayPal payout — has never been executed end to end against real infrastructure. Every individual link has been reasoned about and several have been fixed; the chain has not been pulled. The database is empty, which makes this the cheapest it will ever be to do." },
]));

children.push(Rich([
  { t: "3.  No MFA on the accounts that can move money. ", b: true },
  { t: "Admin accounts approve payouts and set the platform fee, and a password is currently the only thing protecting them. The compensating controls are real — table-authoritative role checks, breached-password screening, distributed-ready rate limiting, and column grants that keep even a compromised ordinary account away from balances — but none of them survive a phished admin credential. The implementation seam is documented in docs/RUNBOOK.md §4; it needs a product decision on enrollment before it can ship safely." },
]));

children.push(pageBreak());

// ── 2. Scope and method ─────────────────────────────────────────────────────
children.push(H1("2.  Scope and method"));

children.push(P("This audit reads the code and interrogates the live systems; it does not rely on prior reports. Every claim below was checked against one of four sources:"));

children.push(Bullet("The repository at commit 49d074e and the remediation branch on top of it — 46 API routes, 20 pages, 63 components, 55 library modules, 30 SQL migrations."));
children.push(Bullet("The live Supabase project, queried directly for policies, grants, triggers, function definitions, row counts and linter output."));
children.push(Bullet("The live Vercel project, for deployment state and build history."));
children.push(Bullet("The repository's own CI configuration and gate results."));

children.push(spacer(80));
children.push(P("Where a control is present, it is marked Pass and described, because an audit that lists only problems gives a false picture of a system's shape. Where something is missing, it is stated plainly and given a severity reflecting its consequence on a real-money product specifically."));

children.push(H3("What this audit does not cover"));
children.push(Bullet("Penetration testing. No live exploitation was attempted against the production deployment."));
children.push(Bullet("Legal and regulatory compliance. Section 9.F raises the questions a real-money contest platform must answer, but those require qualified counsel in each operating jurisdiction — nothing here is legal advice."));
children.push(Bullet("Load and performance testing under concurrency. The database has never served real traffic."));
children.push(Bullet("Third-party account configuration inside the Stripe and PayPal dashboards, which is not visible from the code."));

children.push(pageBreak());

// ── 3. System overview ──────────────────────────────────────────────────────
children.push(H1("3.  System overview"));

children.push(kvTable([
  ["Framework", "Next.js 16.3.0, App Router. Route protection in src/proxy.ts (Next 16's rename of middleware.ts)."],
  ["Runtime", "React 19.2.3, TypeScript 5, Node 22."],
  ["UI", "Tailwind CSS v4, Radix UI primitives, Framer Motion, Recharts, next-themes."],
  ["Data layer", "TanStack Query v5 on the client; Supabase JS on both sides."],
  ["Database", "Supabase Postgres. RLS on every public table, plus a private schema of SECURITY DEFINER helpers."],
  ["Auth", "Supabase Auth, email + password (10 chars, mixed case, digit). Session in an httpOnly cookie."],
  ["Payments in", "Stripe Checkout. Webhook is the source of truth for fulfilment."],
  ["Payments out", "PayPal Payouts, admin-approved."],
  ["Sports data", "ESPN scoreboard feed."],
  ["Throttling", "Upstash Redis via HTTP REST, with an in-memory fallback."],
  ["Hosting", "Vercel. One cron: /api/cron/settle, daily at 08:00 UTC."],
], 2200));

children.push(spacer(160));
children.push(H3("The two-client model"));
children.push(P(
  "The codebase maintains a deliberate split that is worth stating because most of the security model rests on it. A request-scoped client carries the caller's JWT and is subject to row-level security — this is what every user-facing read and write uses. A service-role client bypasses RLS entirely and is confined to server-side fulfilment, settlement and admin operations. The database is written so that the RLS path alone is sufficient to protect user data, and the service-role path is treated as a privilege that must be justified at each call site rather than a convenience."
));

children.push(H3("Where authorization actually lives"));
children.push(P(
  "src/proxy.ts gates page routes by session and role, but the file documents itself as defence-in-depth rather than the boundary — route handlers can be reached directly in some deployment topologies. The real boundary is per-route: requireAdmin() for admin surfaces, ownership predicates in RLS for user data, and secret-gated guards that fail closed for the two machine endpoints. This is the correct arrangement, and the code is explicit about it."
));

children.push(pageBreak());

// ── 4. Frontend audit ───────────────────────────────────────────────────────
children.push(H1("4.  Frontend audit"));

children.push(H2("4.1  Injection and content security"));
children.push(P(
  "The frontend has no DOM-injection sinks at all. A sweep for dangerouslySetInnerHTML, direct innerHTML assignment, eval and the Function constructor across all 83 component and page files returns nothing. All rendering goes through JSX, so React's escaping applies universally — including to chat messages, which are the one place where user-authored text from another person reaches your screen."
));
children.push(P(
  "The Content Security Policy is nonce-based and assembled per request in src/lib/csp.ts, then set by the proxy on every document response. script-src carries no 'unsafe-inline' in production; Next's inline bootstrap is authorised by the nonce instead. frame-ancestors is 'none'. style-src retains 'unsafe-inline' — a deliberate and correctly-reasoned exception, since Tailwind injects style attributes at runtime and inline CSS cannot execute JavaScript."
));

children.push(findingsTable([
  { id: "FE-1", finding: "No dangerouslySetInnerHTML, innerHTML, eval or new Function anywhere in src/.", sev: "Pass", status: "Verified at 49d074e" },
  { id: "FE-2", finding: "Nonce-based CSP; 'unsafe-inline' absent from script-src in production.", sev: "Pass", status: "src/lib/csp.ts" },
  { id: "FE-3", finding: "Session cookie is httpOnly; realtime authenticates via a separate short-lived access token that cannot be renewed.", sev: "Pass", status: "Fixed in 697472d" },
  { id: "FE-4", finding: "All images route through next/image; zero raw <img> tags.", sev: "Pass", status: "Verified" },
]));

children.push(H2("4.2  Error handling and resilience"));
children.push(P(
  "This was the weakest area of the frontend at the start of the cycle — no error boundary of any kind existed — and it is now closed at every level. src/app/error.tsx catches route-level render failures and src/app/global-error.tsx catches a failure of the root layout itself; both redact the internal message in production, surface the error digest for support correlation, and report the failure to /api/client-errors so it lands in the app_errors table where an operator can see it. Loading boundaries exist at the root and in each route group, so every navigation shows a server-driven fallback instead of a frozen screen — necessary here because the nonce-based CSP makes every page render per-request."
));

children.push(findingsTable([
  { id: "FE-5", finding: "Error boundaries now present at both levels: src/app/error.tsx for route failures and src/app/global-error.tsx for root-layout failures. The internal error message is redacted in production and a digest is surfaced for support correlation.", sev: "Pass", status: "Fixed — verified in-browser" },
  { id: "FE-6", finding: "loading.tsx boundaries at the root and in all three route groups; every navigation has a suspense fallback.", sev: "Pass", status: "Fixed this cycle" },
  { id: "FE-7", finding: "Client errors now reach an operator: both boundaries POST to /api/client-errors (rate-limited, zod-capped, session-attributed server-side), which files reports in the service-role-only app_errors table.", sev: "Pass", status: "Fixed this cycle" },
]));

children.push(H2("4.3  Accessibility"));
children.push(P(
  "Accessibility now has an automated floor that CI enforces: 21 jsx-a11y rules run at error severity in the blocking lint gate. Turning the gate on surfaced 23 real defects — clickable <div>s with no keyboard path across the pool-type selector, game selection cards, friend invites and the purchase flow, plus unassociated form labels — and every one was fixed with native semantics: real <button> elements with aria-pressed state, htmlFor/id label pairing, and role=\"button\" with explicit key handling only where nesting made a native button impossible. Radix UI continues to supply correct primitive semantics underneath."
));
children.push(P(
  "The gate is a floor, not a ceiling: it stops keyboard and semantic regressions from landing, but a manual screen-reader pass before launch is still the professional standard for a product that takes payments."
));

children.push(findingsTable([
  { id: "FE-8", finding: "21 jsx-a11y rules enforced at error severity in blocking CI; 23 keyboard/label defects found and fixed with native semantics. Manual screen-reader pass recommended before launch (9.D).", sev: "Pass", status: "Fixed this cycle" },
]));

children.push(H2("4.4  SEO and discoverability"));
children.push(P(
  "Every page now carries metadata: server pages export it directly, and the client-component pages received fifteen small server layout files whose only job is to hold the title and description Next.js requires to live in a server file. sitemap.ts enumerates the public, logged-out surface — pool pages are deliberately absent so private pools cannot leak existence through a sitemap — and robots.ts disallows the authenticated routes, not as a security control but to stop crawlers burning budget on redirects. The remaining item is architectural rather than a defect: the root layout sets force-dynamic so the per-request CSP nonce can be applied, which trades CDN caching of the marketing pages for a strict content-security posture. That trade is documented and accepted; the loading boundaries added this cycle absorb its UX cost."
));

children.push(findingsTable([
  { id: "FE-9", finding: "All pages define metadata; sitemap.ts covers the public surface; robots.ts steers crawlers away from authenticated routes.", sev: "Pass", status: "Fixed this cycle" },
  { id: "FE-10", finding: "force-dynamic remains global so the per-request CSP nonce holds everywhere — a deliberate security-over-caching trade, documented, with loading boundaries absorbing the UX cost.", sev: "Pass", status: "Accepted design decision" },
]));

children.push(pageBreak());

// ── 5. Backend audit ────────────────────────────────────────────────────────
children.push(H1("5.  Backend audit"));

children.push(H2("5.1  Authentication and authorization"));
children.push(P(
  "requireAdmin() reads the role from the users table and deliberately ignores the JWT's app_metadata.role claim. The reasoning in the code is exactly right and worth preserving: Supabase cannot revoke an already-issued access token, so trusting the claim would leave a demoted or offboarded admin with full admin API access until their token expired — up to an hour after the revocation was written. The database's is_admin() helper is table-authoritative for the same reason, so the two layers agree."
));
children.push(P(
  "Password policy requires 10 characters with mixed case and a digit, enforced in a shared zod schema so it applies on every path rather than only at signup. The signup route deliberately refuses to echo Supabase's \"User already registered\" message, which would otherwise turn the endpoint into a user-enumeration oracle against a gambling site — it logs the real reason and answers generically."
));
children.push(P(
  "Breached-password screening, previously unavailable because Supabase gates its HaveIBeenPwned integration behind a paid plan, is now implemented at the application layer instead: signup hashes the candidate password with SHA-1, sends only the first five hex characters to the HIBP range API (k-anonymity — the password never leaves the server, and HIBP cannot reconstruct it), and rejects credentials that appear in known breach corpora. The check fails open on any network error so an HIBP outage cannot block signups, distinguishes real breach counts from the API's padding entries, and is pinned by unit tests covering detection, padding and the fail-open path."
));

children.push(findingsTable([
  { id: "BE-1", finding: "Admin checks are table-authoritative, not JWT-claim-based, so role revocation takes effect immediately.", sev: "Pass", status: "src/lib/require-admin.ts" },
  { id: "BE-2", finding: "Signup does not leak account existence; enumeration oracle closed.", sev: "Pass", status: "Fixed in 8dd4a4b" },
  { id: "BE-3", finding: "App-level breached-password check at signup via the HIBP range API (k-anonymity, fail-open, padding-aware), replacing the plan-gated Supabase feature. Unit-tested offline.", sev: "Pass", status: "Fixed this cycle" },
  { id: "BE-4", finding: "No multi-factor authentication for admin accounts, which can move money. Needs a product decision on enrollment before enforcement can ship; seam and interim controls documented in docs/RUNBOOK.md §4.", sev: "High", status: "Open — external decision required" },
]));

children.push(H2("5.2  Request guards — CSRF, throttling, validation"));
children.push(P(
  "Cross-site request forgery is comprehensively handled. Every authenticated state-changing route calls assertSameOrigin — 25 routes in total. The four mutating routes that do not are correct not to: the Stripe webhook authenticates by signature, seed-admin and cron/settle are gated on shared secrets that fail closed when unset, and newsletter/subscribe is unauthenticated, so there is no victim session for an attacker to ride."
));
children.push(P(
  "Rate limiting and input validation, the two thin controls of the previous cycle, are now both complete. Every state-changing route enforces a limit tuned to its abuse economics — tight windows on the unauthenticated intake endpoints, generous ceilings on admin work that must never trip during a legitimate payout run. Every route that accepts input parses it through a shared zod schema in src/lib/validations.ts: bodies on the mutating routes, and uuid validation on path parameters so a malformed id answers 404 instead of leaking a database error. The routes without a schema are exactly the ones that should not have one — secret-gated crons with no body, the signature-authenticated Stripe webhook, and signout."
));

children.push(findingsTable([
  { id: "BE-5", finding: "CSRF origin checks on all 25 authenticated state-changing routes; the four exceptions are correctly justified.", sev: "Pass", status: "Verified route by route" },
  { id: "BE-6", finding: "Rate limiting now covers every state-changing route — 24 in total, including invitation accept/decline, notification read, card picks and lock, pool update and delete, game outcome, admin payout completion and the admin config surfaces.", sev: "Pass", status: "Fixed — 429 verified" },
  { id: "BE-7", finding: "Every input-accepting route validates through shared zod schemas (bodies and uuid path params); schema-less routes are exactly the secret-gated/signature-authenticated set.", sev: "Pass", status: "Fixed this cycle" },
]));

children.push(H2("5.3  Money paths"));
children.push(P(
  "This is the part of the system that has received the most attention, and it holds up well under reading."
));
children.push(Bullet("Purchase amounts are derived from the Stripe session server-side. The client cannot influence price."));
children.push(Bullet("The webhook calls constructEvent on the raw body before any parsing, so the signature covers exactly what was signed."));
children.push(Bullet("Fulfilment is idempotent twice over: a cheap transaction lookup short-circuits repeats, and a unique index closes the race window that lookup alone would leave open."));
children.push(Bullet("Payout completion checks user_transactions for an existing reference before paying, so a double-submitted approval cannot pay twice."));
children.push(Bullet("Settlement credits winner balances through an atomic RPC rather than an absolute write, eliminating a lost-update window."));
children.push(Bullet("The platform fee is locked per pool at creation, so changing the global rate mid-pool cannot re-split an in-flight pot."));
children.push(Bullet("Two legacy endpoints — one that issued paid cards with no payment, one that wrote picks the scoring engine never reads — are retired as explicit 410s so stragglers fail loudly rather than silently."));

children.push(spacer(80));
children.push(P(
  "The chain is now also watched from the outside: a daily reconciliation cron (/api/cron/reconcile, secret-gated, read-only by design) pulls both ends of each money flow and files every mismatch in app_errors. It checks in both directions — every paid Stripe checkout session must have a completed pool_transactions row, and every completed ledger row must correspond to a paid session, so both a lost webhook and a fabricated transaction surface. Completed payouts must carry a traceable PayPal batch id. Reconciliation deliberately never repairs records automatically: a wrong automatic fix is strictly worse than a loud mismatch."
));
children.push(P(
  "The remaining reservation is unchanged in kind: the chain has never been pulled end to end against live Stripe and PayPal infrastructure. Idempotency that is correct by inspection — and now unit-tested at the library layer — is still not the same as idempotency observed surviving a genuine duplicate webhook delivery. That run needs real test-mode credentials and is specified step by step in Section 9.A."
));

children.push(findingsTable([
  { id: "BE-8", finding: "Stripe webhook verifies signature before parsing; fulfilment idempotent via transaction lookup plus unique index.", sev: "Pass", status: "Verified" },
  { id: "BE-9", finding: "Payout completion is idempotent; settlement credits balances atomically; per-pool fee lock prevents mid-pool re-splits.", sev: "Pass", status: "Verified" },
  { id: "BE-10", finding: "No end-to-end run of purchase → fulfilment → picks → settlement → payout against real Stripe/PayPal test infrastructure. Needs live test-mode credentials; procedure specified in 9.A.", sev: "High", status: "Open — external credentials required" },
  { id: "BE-11", finding: "Daily reconciliation cron compares Stripe sessions against pool_transactions in both directions and verifies every completed payout carries a PayPal batch id; mismatches are filed in app_errors.", sev: "Pass", status: "Fixed this cycle" },
]));

children.push(pageBreak());

// ── 6. Database audit ───────────────────────────────────────────────────────
children.push(H1("6.  Database audit"));

children.push(P(
  "Twenty-nine migrations, row-level security enabled on every public table, and — after this cycle — column-level grants backing the policies rather than policies alone. The distinction matters and the codebase learned it the hard way: RLS cannot restrict which columns an UPDATE touches. Only grants can. A table-wide UPDATE grant to authenticated on public.users meant a single WITH CHECK predicate was the only thing between an ordinary account and crediting its own balance or promoting itself to admin."
));

children.push(H3("Live invariants, verified by direct query"));
{
  const w = [6200, 3160];
  children.push(table(w, [
    headerRow(["Invariant", "State"], w),
    ...[
      ["RLS enabled on every public table", "Yes"],
      ["pools settlement-guard triggers attached", "Exactly 1"],
      ["pool_invitations immutability-guard triggers attached", "Exactly 1"],
      ["Loose self-invite INSERT policy", "Removed"],
      ["authenticated write grant on platform_settings", "None"],
      ["anon direct SELECT on pool_winners", "Revoked (RPC-only)"],
      ["Client INSERT/UPDATE on users.balance or users.role", "None"],
      ["get_public_winners filters to public pools", "Yes"],
      ["app_errors reachable by anon/authenticated", "No — service-role only"],
      ["Permissive SELECT policies per consolidated table", "Exactly 1"],
    ].map(r => new TableRow({ children: [
      txtCell(r[0], { w: w[0] }),
      txtCell(r[1], { w: w[1], bg: SEV.Pass.bg, color: SEV.Pass.fg, bold: true }),
    ]})),
  ]));
}

children.push(spacer(160));
children.push(H3("Advisor output"));
children.push(P(
  "Supabase's security linter reports four warnings, all of which are intentional and each of which carries a COMMENT ON FUNCTION in the database recording why. Three functions — get_public_winners, get_pool_financials and get_pools_financials — are deliberately anon-executable because the logged-out lobby and the homepage winners ticker need them; each returns aggregates or a minimal projection rather than rows, and revoking anon reintroduces a \"$0 prize pot\" display bug. claim_pool_payout is deliberately authenticated-executable and derives identity from auth.uid() rather than trusting a parameter."
));
children.push(P(
  "The performance linter's multiple-permissive-policies warnings are gone: the five tables that carried an \"admin can view all\" policy alongside a \"user can view own\" policy for the same role and action now each hold exactly one SELECT policy with the admin arm folded in — verified live after migration, with a DO-block invariant in the migration itself asserting the end state. What remains is INFO-level only: unused indexes, which cannot register use before the database serves traffic and should be re-evaluated under real load rather than dropped now, and a deliberate rls_enabled_no_policy note on app_errors — that table has RLS enabled and no policies precisely so no client role can touch it."
));

children.push(findingsTable([
  { id: "DB-1", finding: "RLS on every public table, backed by column-level grants on the money and identity columns.", sev: "Pass", status: "Verified live" },
  { id: "DB-2", finding: "Four SECURITY DEFINER advisor warnings, all intentional and documented in-database via COMMENT ON FUNCTION.", sev: "Pass", status: "Accepted exceptions" },
  { id: "DB-3", finding: "SELECT policies consolidated to one per table on users, user_transactions, user_payout_accounts, payout_requests and payout_approvals; advisor warnings cleared, invariant asserted in-migration.", sev: "Pass", status: "Fixed this cycle — verified live" },
  { id: "DB-4", finding: "Unused-index INFO notices are expected on a zero-traffic database and deliberately retained; dropping indexes before real query patterns exist would be premature.", sev: "Pass", status: "Accepted — re-evaluate under load" },
  { id: "DB-5", finding: "Backup, retention and restore-rehearsal policy documented in docs/RUNBOOK.md §2, including the post-restore reconciliation step. Enabling PITR and performing the first rehearsal are operator actions listed in 9.A.", sev: "Pass", status: "Fixed this cycle — rehearsal pending" },
]));

children.push(pageBreak());

// ── 7. Infrastructure ───────────────────────────────────────────────────────
children.push(H1("7.  Infrastructure and operations"));

children.push(H2("7.1  Build and continuous integration"));
children.push(P(
  "CI runs on every push and pull request and blocks a merge on four gates: typecheck, the unit and settlement regression suites, a full production build, and lint — which now enforces the accessibility ruleset at error severity alongside the TypeScript rules. All four gates are green at the commit this document describes."
));
children.push(P(
  "The build itself runs through webpack rather than Turbopack. This was not a preference: Next 16.3.0's Turbopack build omits the Node file-trace manifest that Vercel's packaging step reads, and two production deploys failed on exactly that before the cause was isolated. The current production deployment is green."
));

children.push(H2("7.2  Scheduled work"));
children.push(P(
  "Two Vercel crons run, both authenticated by a bearer secret that fails closed when unset. /api/cron/settle now runs hourly rather than daily — a pool whose last game ends Sunday evening settles within the hour instead of Monday morning, which is the difference between winnings appearing promptly and players reading the delay as a fault. Settlement is idempotent per pool, so the tighter schedule adds no double-pay risk. /api/cron/reconcile runs daily, pulling Stripe and PayPal records against the ledger and filing mismatches in app_errors; it also purges error rows past the 90-day retention window."
));

children.push(H2("7.3  Observability"));
children.push(P(
  "Observability was this audit's single largest operational gap; the detection layer now exists and is durable. Server money-path failures — a webhook fulfilment that cannot be completed, a PayPal payout that fails after the balance moved — are written to the app_errors table through recordAppError(), alongside every client crash report and every reconciliation mismatch. The table is service-role-only by construction (RLS enabled, zero policies, zero client grants) because error records routinely contain internals. Structured JSON logging (logEvent) instruments the same paths, so the Vercel log stream is searchable rather than 69 loose console statements, and the reconcile cron is itself a scheduled detector for the failures that never throw."
));
children.push(P(
  "What this design deliberately leaves outside the repository is the alert destination: something must watch app_errors and page a human — a scheduled query, a log drain, or a Sentry-class service wired to the same seams. That choice needs an account and an owner, and docs/RUNBOOK.md §3 carries it as an explicit pre-launch provisioning step alongside the Upstash variables."
));

children.push(findingsTable([
  { id: "OPS-1", finding: "CI blocks merges on typecheck, settlement tests and build. Lint is clean and could now be promoted to blocking.", sev: "Pass", status: "Working" },
  { id: "OPS-2", finding: "Error capture (app_errors, service-role only), client crash reporting, structured JSON logging and a scheduled reconciliation detector are live. External alert destination and uptime probe remain operator provisioning (runbook §3).", sev: "Pass", status: "Fixed in code — destination pending" },
  { id: "OPS-3", finding: "Upstash env vars unset in production, so rate limiting degrades to per-instance in-memory windows. The code path is ready and tested; this is a five-minute provisioning task (runbook §3).", sev: "High", status: "Open — external provisioning required" },
  { id: "OPS-4", finding: "Settlement runs hourly; reconciliation runs daily. Both secret-gated, both idempotent.", sev: "Pass", status: "Fixed this cycle" },
  { id: "OPS-5", finding: "docs/RUNBOOK.md covers the failure modes that matter — failed webhook, failed payout batch (both shapes), mis-settled pool, processor outage, missed cron — plus backup/restore and pre-launch provisioning.", sev: "Pass", status: "Fixed this cycle" },
]));

children.push(H2("7.4  Testing"));
children.push(P(
  "One test exists: scripts/verify-settlement.ts, which exercises the scoring, tie-break and cent-exact pot split across 243 combinations. It is genuinely good, it runs in CI, and it has already caught a real regression when a merge reintroduced pre-audit payout mathematics."
));
children.push(P(
  "It no longer stands alone. A unit suite (tests/lib.test.ts, node:test via tsx, no framework dependency and no network) now pins the security-critical library layer: the open-redirect clamp, the CSRF origin boundary, the rate limiter's budget and 429 shape, the production CSP's nonce and unsafe-inline exclusion, the password policy and the money-route schemas, and the HIBP breach check's parsing, padding handling and fail-open behaviour. Eighteen tests run in the blocking CI gate alongside the settlement suite. The guards these tests pin are the shared enforcement layer every route passes through, which is deliberate: one tested seam protecting 46 routes beats 46 shallow route tests. The gap that remains is the end-to-end harness, which is the same item as BE-10 — it needs real test-mode processor credentials, not more code."
));

children.push(findingsTable([
  { id: "OPS-6", finding: "Settlement regression suite (243 combinations) runs in CI and has caught a real payout-math regression.", sev: "Pass", status: "scripts/verify-settlement.ts" },
  { id: "OPS-7", finding: "Unit suite pins the shared guard layer (redirect clamp, CSRF, rate limiter, CSP, schemas, breach check) and runs in blocking CI beside the settlement suite. E2E harness is tracked as BE-10.", sev: "Pass", status: "Fixed this cycle" },
]));

children.push(pageBreak());

// ── 8. Risk register ────────────────────────────────────────────────────────
children.push(H1("8.  Risk register"));
children.push(P("Open items ranked by consequence on a real-money product. Passed controls are omitted here; they appear in Sections 4 to 7. Fifteen findings from this register were closed by the 2026-08-12 remediation cycle; the three that remain all require an account, credentials or a decision that lives outside the repository."));

{
  const w = [700, 3500, 3400, 1760];
  children.push(table(w, [
    headerRow(["ID", "Risk", "Consequence if it lands", "Severity"], w),
    ...[
      ["OPS-3", "Rate limiting is per-instance until Upstash is provisioned", "Credential stuffing against user accounts holding real balances is throttled far more weakly than intended; two env vars close it", "High"],
      ["BE-10", "Money path never executed end to end against real processors", "A break anywhere in purchase → settlement → payout is found by a paying user, not by you; needs Stripe/PayPal test credentials", "High"],
      ["BE-4", "No MFA for admin accounts", "One phished admin credential can approve payouts and change platform fees; needs an enrollment-flow decision", "High"],
    ].map(r => new TableRow({ children: [
      txtCell(r[0], { w: w[0], bold: true }),
      txtCell(r[1], { w: w[1] }),
      txtCell(r[2], { w: w[2] }),
      txtCell(r[3], { w: w[3], bg: SEV[r[3]].bg, color: SEV[r[3]].fg, bold: true, align: AlignmentType.CENTER }),
    ]})),
  ]));
}

children.push(pageBreak());

// ── 9. Checklists ───────────────────────────────────────────────────────────
children.push(H1("9.  Checklists — lacking requirements"));
children.push(P(
  "Updated for the 2026-08-12 remediation cycle: items the cycle closed have been removed, and what remains is genuinely outstanding — almost all of it operator provisioning, external verification, or product/legal decisions rather than code. Section 9.A must be cleared before the platform holds a single real deposit; the rest is ordered by how much it will hurt to have skipped."
));

children.push(H2("9.A  Blocking — before real money moves"));
children.push(checklist([
  { req: "Provision Upstash Redis and set both env vars", why: "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are unset in production, so every throttle — including the sign-in limit protecting accounts with balances — degrades to a per-instance in-memory window that serverless scatters across processes. The limiter code path is ready and unit-tested; this is the last two-minute fix with a disproportionate payoff. (OPS-3)", pri: "Critical" },
  { req: "Execute the money path end to end in Stripe test mode", why: "Purchase → webhook → card issued → picks → settlement → balance credit → PayPal payout. This chain has never been run whole. Include a deliberately duplicated webhook delivery to prove idempotency under real conditions rather than by inspection. (BE-10)", pri: "Critical" },
  { req: "Verify the Stripe webhook endpoint and secret in the live dashboard", why: "STRIPE_WEBHOOK_SECRET must match the live endpoint. If the webhook is misconfigured a user is charged and receives no card — the exact failure the fulfilment code is written to prevent, and the exact mismatch the new reconcile cron will flag the morning after.", pri: "Critical" },
  { req: "Confirm PAYPAL_MODE is live and credentials are production", why: "The code refuses to fail open to sandbox, so a misconfiguration blocks payouts rather than faking them — but it must be set correctly before the first withdrawal request arrives.", pri: "Critical" },
  { req: "Point an alert at app_errors and stand up an uptime probe", why: "The error sink, structured logs and reconciliation detector were built this cycle; what remains is the pager. A scheduled query on app_errors, a Vercel log drain, or a Sentry-class service wired to the same seams — pick one and give it an owner. (OPS-2 residual)", pri: "Critical" },
  { req: "Enable PITR and perform the first restore rehearsal", why: "The backup and restore procedure is documented in docs/RUNBOOK.md §2, including the post-restore reconciliation step. It has not yet been rehearsed, and a daily snapshot alone can lose up to 24 hours of money movements. (DB-5 residual)", pri: "Critical" },
  { req: "Decide and ship admin MFA", why: "Admins approve payouts and set the platform fee; one phished credential currently moves money. The enforcement seam and the enrollment prerequisite are documented in docs/RUNBOOK.md §4 — do not enforce before enrollment exists or every admin locks out. (BE-4)", pri: "Critical" },
  { req: "Unset SETUP_SECRET once the admin account exists", why: "It gates a service-role write endpoint. Leaving it set after bootstrap leaves an unnecessary privileged path enabled.", pri: "High" },
]));

children.push(H2("9.B  Security hardening"));
children.push(checklist([
  { req: "Add an admin action audit log", why: "Role changes, payout approvals and platform-fee edits should be attributable after the fact. Financial disputes are resolved from an audit trail. app_errors is the error sink, not an audit trail — this is a separate table with a separate write path.", pri: "Medium" },
  { req: "Schedule a dependency vulnerability scan", why: "Advisories were cleared during the first cycle, but nothing re-checks them. Dependabot or npm audit in CI keeps that honest.", pri: "Low" },
]));

children.push(H2("9.C  Reliability and testing"));
children.push(checklist([
  { req: "Add an end-to-end harness", why: "Playwright is already available in this environment. Signup, purchase, picks, settlement and withdrawal are the journeys that must never silently break. Pairs with the 9.A test-mode money-path run.", pri: "High" },
  { req: "Extend route-level test coverage beyond the guard layer", why: "The unit suite pins the shared guards every route passes through, which is the highest-leverage seam — but per-route tests of auth, ownership and error shapes would catch wiring mistakes the guard tests cannot.", pri: "Medium" },
]));

children.push(H2("9.D  Frontend and user experience"));
children.push(checklist([
  { req: "Run a manual screen-reader pass", why: "The automated jsx-a11y gate now blocks keyboard and semantic regressions in CI, and 23 defects were fixed this cycle — but an automated floor is not a usability verdict. One session with VoiceOver or NVDA across signup, purchase and picks closes the gap.", pri: "Medium" },
  { req: "Verify the httpOnly session change against live Supabase realtime", why: "Chat now authenticates through a separate short-lived token path. The mechanism is sound but has not been exercised against the live realtime service.", pri: "Medium" },
  { req: "Recover static generation for public pages (optional)", why: "force-dynamic is global for the CSP nonce — an accepted trade this cycle. If marketing SEO becomes a priority, serve public pages a nonce-free CSP and scope force-dynamic to authenticated routes.", pri: "Low" },
]));

children.push(H2("9.E  Operational readiness"));
children.push(checklist([
  { req: "Uptime and health-check monitoring", why: "Nothing currently detects that the site is down or a cron stopped firing. Vercel's cron dashboard shows history but does not page anyone.", pri: "High" },
  { req: "Define support and dispute-resolution process", why: "A player will contest a settlement result. Decide now who investigates, against what evidence, and who can authorise a correction — RUNBOOK.md §1.3 covers the mechanics; this is the org question.", pri: "Medium" },
  { req: "Document the admin bootstrap and offboarding procedure", why: "How an admin is created, and how access is fully revoked when someone leaves.", pri: "Medium" },
  { req: "Set a staging environment mirroring production", why: "Money-path changes should be exercised somewhere real before they reach users.", pri: "Medium" },
]));

children.push(H2("9.F  Legal and regulatory"));
children.push(P(
  "These are questions, not findings. A platform that takes entry fees and pays cash prizes on sporting outcomes sits in a heavily regulated space that varies by jurisdiction, and none of the following can be resolved from the code — each needs qualified counsel in every territory you intend to operate in. They are listed because shipping without answering them is the largest non-technical risk this project carries.",
  { italics: true }
));
children.push(checklist([
  { req: "Obtain a legal opinion on operating jurisdictions", why: "Paid-entry contests with cash prizes on sporting outcomes are regulated differently in each US state and most other countries. Some require licensing; some prohibit the model outright.", pri: "Critical" },
  { req: "Implement age verification", why: "Minimum age requirements apply nearly everywhere and are commonly 18 or 21 depending on jurisdiction. There is currently no age gate of any kind.", pri: "Critical" },
  { req: "Implement geolocation restriction", why: "If any target jurisdiction prohibits or licenses the model, access must be blocked there. Nothing currently restricts by location.", pri: "Critical" },
  { req: "Determine KYC/AML obligations", why: "Identity verification and transaction monitoring thresholds may apply to a platform holding user balances and paying out cash.", pri: "Critical" },
  { req: "Determine tax reporting obligations", why: "In the US, winnings above certain thresholds trigger information-reporting duties. The data model must capture whatever those require before the first payout, not after.", pri: "High" },
  { req: "Add responsible-gambling controls", why: "Deposit limits, self-exclusion and support signposting are required in many jurisdictions and expected in most.", pri: "High" },
  { req: "Have counsel review the Terms and Privacy pages", why: "Both pages exist but have not been reviewed against the actual data flows, the payment processors in use, or the contest rules as implemented.", pri: "High" },
  { req: "Confirm Stripe and PayPal permit this use case", why: "Both processors restrict gambling and contest-related businesses and require prior approval. Operating outside the agreed category risks abrupt account termination with funds held.", pri: "Critical" },
  { req: "Publish the contest rules as binding terms", why: "Scoring, tie-breaks, the platform fee, refund conditions and what happens to an abandoned or postponed fixture all need to be stated before someone disputes one.", pri: "High" },
  { req: "Complete a data-protection assessment", why: "GDPR, CCPA or equivalent obligations attach to holding identity, location and financial data. Retention, deletion and export paths must exist.", pri: "High" },
]));

children.push(pageBreak());

// ── 10. Appendix A ──────────────────────────────────────────────────────────
children.push(H1("10.  Appendix A — API route inventory"));
children.push(P("All 46 routes, with the guards each enforces — re-verified after the remediation cycle. ✓ present, — absent, n/a not applicable. Zod covers request bodies and uuid path parameters; routes marked n/a take no input (secret-gated crons, the signature-authenticated webhook, signout)."));

const routes = [
  ["admin/payout-requests", "GET", "n/a", "—", "n/a", "requireAdmin"],
  ["admin/payout-requests/[id]/complete", "PATCH", "✓", "✓", "✓", "requireAdmin + idempotent"],
  ["admin/pools/[poolId]/settings", "PUT", "✓", "✓", "✓", "requireAdmin"],
  ["admin/sync/teams", "POST", "✓", "✓", "n/a", "requireAdmin"],
  ["admin/users", "GET", "n/a", "—", "n/a", "requireAdmin"],
  ["admin/users/[userId]/role", "PATCH", "✓", "✓", "✓", "requireAdmin"],
  ["auth/me", "GET", "n/a", "—", "n/a", "Session"],
  ["auth/realtime-token", "GET", "n/a", "—", "n/a", "getUser(); access token only"],
  ["auth/signin", "POST", "✓", "✓", "✓", "Public"],
  ["auth/signout", "POST", "✓", "—", "n/a", "Session"],
  ["auth/signup", "POST", "✓", "✓", "✓", "Public; no enumeration + HIBP check"],
  ["client-errors", "POST", "n/a", "✓", "✓", "Public by design; tight limit, capped fields"],
  ["cron/reconcile", "GET", "n/a", "—", "n/a", "CRON_SECRET, fails closed; read-only"],
  ["cron/settle", "GET", "n/a", "—", "n/a", "CRON_SECRET, fails closed"],
  ["games", "GET", "n/a", "—", "n/a", "Public read"],
  ["games/[gameId]", "GET", "n/a", "—", "n/a", "Public read"],
  ["games/[gameId]/outcome", "PUT", "✓", "✓", "✓", "requireAdmin"],
  ["invitations", "GET", "n/a", "—", "n/a", "Session + RLS"],
  ["invitations/[id]/accept", "POST", "✓", "✓", "✓", "Session + RLS"],
  ["invitations/[id]/decline", "POST", "✓", "✓", "✓", "Session + RLS"],
  ["me/balance", "GET", "n/a", "—", "n/a", "Session + RLS"],
  ["me/claim-payout", "POST", "✓", "✓", "✓", "Session; RPC uses auth.uid()"],
  ["me/games", "GET", "n/a", "—", "n/a", "Session + RLS"],
  ["me/payout-account", "GET, PUT", "✓", "✓", "✓", "Session + RLS"],
  ["me/payout-request", "GET, POST", "✓", "✓", "✓", "Session; balance-checked in RLS"],
  ["me/winnings", "GET", "n/a", "—", "n/a", "Session + RLS"],
  ["newsletter/subscribe", "POST", "n/a", "✓", "✓", "Public; no enumeration"],
  ["nfl/scoreboard", "GET", "n/a", "—", "n/a", "Mock feed for local dev"],
  ["notifications/[id]/read", "PUT", "✓", "✓", "✓", "Session + RLS"],
  ["pools", "GET, POST", "✓", "✓", "✓", "Admin-only create"],
  ["pools/[poolId]", "GET, PATCH, DELETE", "✓", "✓", "✓", "Session + RLS"],
  ["pools/[poolId]/cards", "GET", "n/a", "—", "n/a", "Session + RLS"],
  ["pools/[poolId]/cards/[cardId]/lock", "POST", "✓", "✓", "✓", "Session + RLS"],
  ["pools/[poolId]/cards/[cardId]/picks", "GET, POST", "✓", "✓", "✓", "Session; kickoff lock in RLS"],
  ["pools/[poolId]/cards/[cardId]/submit", "POST", "n/a", "n/a", "n/a", "RETIRED — 410"],
  ["pools/[poolId]/cards/purchase", "POST", "n/a", "n/a", "n/a", "RETIRED — 410"],
  ["pools/[poolId]/chat", "GET, POST", "✓", "✓", "✓", "Session; card holders only"],
  ["pools/[poolId]/games/sync", "POST", "✓", "✓", "—", "requireAdmin"],
  ["pools/[poolId]/invitations", "POST", "✓", "✓", "✓", "Session; owner only"],
  ["pools/complete-finished", "POST", "✓", "—", "n/a", "CRON_SECRET"],
  ["seed-admin", "POST", "n/a", "—", "n/a", "SETUP_SECRET, fails closed"],
  ["stripe/confirm-payment", "POST", "✓", "✓", "✓", "Session; amount from Stripe"],
  ["stripe/create-checkout-session", "POST", "✓", "✓", "✓", "Session; price server-set"],
  ["stripe/webhook", "POST", "n/a", "—", "n/a", "Signature verified pre-parse"],
  ["sync/nfl-games", "POST", "✓", "—", "n/a", "CRON_SECRET"],
  ["winners", "GET", "n/a", "—", "n/a", "Public; RPC, public pools only"],
];

{
  const w = [2900, 1180, 700, 700, 700, 3180];
  children.push(table(w, [
    headerRow(["Route", "Methods", "CSRF", "Limit", "Zod", "Authorization"], w),
    ...routes.map(r => new TableRow({ children: [
      txtCell(r[0], { w: w[0], size: 17 }),
      txtCell(r[1], { w: w[1], size: 17 }),
      txtCell(r[2], { w: w[2], size: 17, align: AlignmentType.CENTER }),
      txtCell(r[3], { w: w[3], size: 17, align: AlignmentType.CENTER }),
      txtCell(r[4], { w: w[4], size: 17, align: AlignmentType.CENTER }),
      txtCell(r[5], { w: w[5], size: 17 }),
    ]})),
  ]));
}

children.push(pageBreak());

// ── 11. Appendix B ──────────────────────────────────────────────────────────
children.push(H1("11.  Appendix B — what this audit cycle fixed"));
children.push(P("Cycle 1: six commits merged to main as PR #1, all verified against the live database and a green production deploy."));

{
  const w = [1500, 4400, 3460];
  children.push(table(w, [
    headerRow(["Commit", "Change", "Why it mattered"], w),
    ...[
      ["8dd4a4b", "Migration pipeline repaired; payout race closed; CSRF origin checks added across the state-changing routes; signup enumeration oracle closed", "A rebuilt database never reached the intended secure state, and the admin payout route could double-pay under concurrency"],
      ["697472d", "Session cookie made httpOnly; realtime moved to a dedicated short-lived token endpoint; dependency advisories cleared", "The cookie carried the refresh token and was readable by JavaScript, so any XSS meant permanent account takeover surviving sign-out and password change"],
      ["7f9eb66", "Stale Vercel build cache disabled across the Next 16.3.0 upgrade", "First isolation step for the failing production deploys"],
      ["f4aca18", "Production build switched to webpack", "Next 16.3.0's Turbopack build omits the file-trace manifest Vercel's packaging step requires; two deploys had already failed on it"],
      ["ee4a382", "Column-level grants on users.balance and users.role; rate limits added to claim-payout, pool creation and game sync", "RLS cannot restrict which columns an UPDATE touches — only grants can. A single WITH CHECK predicate was all that stood between an account and its own balance"],
      ["d9b2dea", "Legacy settlement-guard trigger name dropped before the guard is recreated", "The live database carried the guard under an out-of-band name, so the migration would have attached a second trigger and fired the guard twice per pool update"],
    ].map(r => new TableRow({ children: [
      txtCell(r[0], { w: w[0], bold: true, size: 18 }),
      txtCell(r[1], { w: w[1], size: 18 }),
      txtCell(r[2], { w: w[2], size: 18 }),
    ]})),
  ]));
}

children.push(spacer(200));
children.push(H3("Cycle 2 — 2026-08-12 remediation"));
children.push(P("One coordinated change set closing every remaining Medium and Low finding and four Highs, verified against the live database and the full CI gate."));
{
  const w = [2600, 6760];
  children.push(table(w, [
    headerRow(["Area", "What landed"], w),
    ...[
      ["Error capture", "app_errors table (service-role only), recordAppError()/logEvent() on the webhook and payout failure branches, /api/client-errors intake, both error boundaries reporting. FE-5, FE-7, OPS-2."],
      ["Reconciliation", "/api/cron/reconcile: two-way Stripe↔ledger comparison, payout batch traceability, 90-day error retention, mismatches filed as errors. BE-11."],
      ["Scheduling", "Settlement hourly, reconciliation daily; both secret-gated. OPS-4."],
      ["Validation", "Shared zod schemas on every input-accepting route, including uuid path parameters. BE-7."],
      ["Password safety", "App-level HIBP k-anonymity breach check at signup: fail-open, padding-aware, unit-tested. BE-3."],
      ["Database", "SELECT policies consolidated to one per table on five tables; in-migration invariants; advisor verified clean. DB-3."],
      ["Accessibility", "21 jsx-a11y rules at error severity in blocking CI; 23 keyboard/label defects fixed with native semantics. FE-8."],
      ["Discoverability", "Metadata on all pages, sitemap.ts, robots.ts, loading boundaries everywhere. FE-6, FE-9."],
      ["Testing", "tests/lib.test.ts: 18 unit tests pinning the guard layer (redirect clamp, CSRF, rate limiter, CSP, schemas, HIBP), blocking in CI. OPS-7."],
      ["Operations", "docs/RUNBOOK.md: incident procedures for every money-affecting failure mode, backup/restore policy and rehearsal, pre-launch provisioning table. OPS-5, DB-5."],
    ].map(r => new TableRow({ children: [
      txtCell(r[0], { w: w[0], bold: true, size: 18 }),
      txtCell(r[1], { w: w[1], size: 18 }),
    ]})),
  ]));
}

children.push(spacer(240));
children.push(P(
  "Read together, the two cycles describe a system whose security model is sound, whose failure modes are instrumented and documented, and whose remaining work — Upstash provisioning, the live test-mode money-path run, and the admin MFA decision — requires accounts and decisions rather than code. Section 9.A is the launch gate, and it is now three items deep.",
  { italics: true }
));

// ── Assemble ────────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Security & Reliability Audit",
  title: "Sports Pool — Full-Stack Audit",
  description: "Frontend, backend, database and operational readiness audit with gap checklists",
  numbering: {
    config: [{
      reference: "bullets",
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 460, hanging: 260 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 920, hanging: 260 } } } },
      ],
    }],
  },
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 21 } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            children: ["Sports Pool — Full-Stack Audit  |  2026-08-12 remediation cycle  |  Page ", PageNumber.CURRENT],
            size: 16, color: "8A94A6", font: "Calibri",
          })],
        })],
      }),
    },
    children,
  }],
});

const OUT = process.argv[2] || "Sports-Pool-Full-Stack-Audit.docx";

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf);
  console.log("Wrote", OUT, buf.length, "bytes");
});
