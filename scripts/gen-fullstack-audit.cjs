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
  ["Audited commit", "49d074e (main) — merge of PR #1"],
  ["Supabase project", "veughegjwzsbjgcueyka"],
  ["Production", "sports-pool (Vercel) — deploy READY on 49d074e"],
  ["Audit date", "12 August 2026"],
  ["Data state at audit", "Pre-launch: 0 users, 0 pools, 0 cards, 0 transactions"],
  ["Verdict", "Security posture strong. Not yet launch-ready — see Section 9."],
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
  "The gaps that remain are not, for the most part, holes in the security model. They are the things that surround a system and make it survivable in production: there is no error boundary anywhere in the frontend, no observability stack of any kind, no automated test coverage beyond the settlement engine, and the distributed rate limiter is configured in code but has no backing store provisioned, so every throttle currently degrades to a per-instance in-memory window that a serverless platform scatters across processes."
));

children.push(H3("Headline numbers"));
{
  const w = [2340, 2340, 2340, 2340];
  children.push(table(w, [
    new TableRow({ children: [
      txtCell("44", { w: w[0], bg: "F2F5F9", bold: true, size: 30, align: AlignmentType.CENTER }),
      txtCell("29", { w: w[1], bg: "F2F5F9", bold: true, size: 30, align: AlignmentType.CENTER }),
      txtCell("8", { w: w[2], bg: SEV.High.bg, bold: true, size: 30, color: SEV.High.fg, align: AlignmentType.CENTER }),
      txtCell("20", { w: w[3], bg: SEV.Medium.bg, bold: true, size: 30, color: SEV.Medium.fg, align: AlignmentType.CENTER }),
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
  { t: "3.  The application is invisible in production. ", b: true },
  { t: "There is no error tracking, no structured logging, no alerting, and no uptime monitoring. Diagnostics are 69 " },
  { t: "console", mono: true },
  { t: " statements landing in Vercel's log buffer. If a webhook starts failing, or settlement credits the wrong figure, or PayPal rejects a batch, nobody finds out until a user complains — and on a money product the user complaining is already the incident." },
]));

children.push(pageBreak());

// ── 2. Scope and method ─────────────────────────────────────────────────────
children.push(H1("2.  Scope and method"));

children.push(P("This audit reads the code and interrogates the live systems; it does not rely on prior reports. Every claim below was checked against one of four sources:"));

children.push(Bullet("The repository at commit 49d074e — 44 API routes, 20 pages, 63 components, 53 library modules, 29 SQL migrations."));
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
  "This is the weakest area of the frontend, and the finding is categorical rather than marginal: there is no error boundary anywhere in the application. No error.tsx, no global-error.tsx, at any level of the route tree. Only not-found.tsx exists. Any unhandled exception during render — a malformed API response, an undefined field in a pool object, a date that fails to parse — takes down the entire route and shows Next.js's default error screen."
));
children.push(P(
  "On a product where users are looking at their own money, that screen is not merely ugly. A player who sees a raw crash on the winnings page cannot distinguish a display bug from their balance having vanished, and the support burden of that ambiguity is real. There are also no loading.tsx boundaries, so route transitions have no server-driven suspense fallback."
));

children.push(findingsTable([
  { id: "FE-5", finding: "No error.tsx or global-error.tsx at any level. An unhandled render error blanks the route with Next's default error page.", sev: "High", status: "Open" },
  { id: "FE-6", finding: "No loading.tsx anywhere; no route-level suspense fallbacks during navigation.", sev: "Low", status: "Open" },
  { id: "FE-7", finding: "69 console.* statements are the only client-side diagnostics. No error reporting reaches an operator.", sev: "Medium", status: "Open — see 7.3" },
]));

children.push(H2("4.3  Accessibility"));
children.push(P(
  "Accessibility has not been audited, and the mechanical indicators are thin: 24 aria-label attributes, 5 explicit roles and 7 alt attributes across the whole component and page surface. That is not proof of a problem — Radix UI supplies correct semantics and keyboard behaviour for the primitives it covers, which is a substantial head start — but it is not evidence of correctness either. No automated accessibility checking runs in CI, and no manual keyboard or screen-reader pass has been done."
));
children.push(P(
  "For a consumer product that takes payments, this carries legal exposure in several jurisdictions independent of the ethical case."
));

children.push(findingsTable([
  { id: "FE-8", finding: "No accessibility audit, no automated a11y checks in CI, no keyboard or screen-reader verification.", sev: "Medium", status: "Open" },
]));

children.push(H2("4.4  SEO and discoverability"));
children.push(P(
  "Five of twenty pages export metadata. There is no sitemap.ts and no robots.ts. Separately, the root layout sets force-dynamic so that the per-request CSP nonce can be applied, which means nothing is statically generated or CDN-cached — including the marketing and legal pages that would benefit most. The README documents this as a deliberate trade and describes the fix: serve public pages a separate nonce-free CSP and scope force-dynamic to the authenticated routes."
));

children.push(findingsTable([
  { id: "FE-9", finding: "Only 5 of 20 pages define metadata; no sitemap.ts or robots.ts.", sev: "Low", status: "Open" },
  { id: "FE-10", finding: "No static generation at all — force-dynamic in the root layout for CSP nonce support. Marketing and legal pages pay full server cost.", sev: "Low", status: "Open — documented trade-off" },
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

children.push(findingsTable([
  { id: "BE-1", finding: "Admin checks are table-authoritative, not JWT-claim-based, so role revocation takes effect immediately.", sev: "Pass", status: "src/lib/require-admin.ts" },
  { id: "BE-2", finding: "Signup does not leak account existence; enumeration oracle closed.", sev: "Pass", status: "Fixed in 8dd4a4b" },
  { id: "BE-3", finding: "Supabase leaked-password protection (HaveIBeenPwned) is not enabled — it is a paid-plan feature. Users may choose credentials known to be breached.", sev: "Medium", status: "Open — plan-gated" },
  { id: "BE-4", finding: "No multi-factor authentication available for admin accounts, which can move money.", sev: "High", status: "Open" },
]));

children.push(H2("5.2  Request guards — CSRF, throttling, validation"));
children.push(P(
  "Cross-site request forgery is comprehensively handled. Every authenticated state-changing route calls assertSameOrigin — 25 routes in total. The four mutating routes that do not are correct not to: the Stripe webhook authenticates by signature, seed-admin and cron/settle are gated on shared secrets that fail closed when unset, and newsletter/subscribe is unauthenticated, so there is no victim session for an attacker to ride."
));
children.push(P(
  "Rate limiting is the thinner control. Eleven routes enforce it — the authentication, payment and payout endpoints, which are the right first priorities — but a number of authenticated mutations have none. Most carry limited abuse potential individually; collectively they are an unmetered write surface against the database. Input validation is thinner still: only five routes parse their body through a zod schema. The remainder hand-roll checks in the shape of typeof body.x === \"string\", which works but is inconsistent, easy to get subtly wrong, and gives no schema to reason about."
));

children.push(findingsTable([
  { id: "BE-5", finding: "CSRF origin checks on all 25 authenticated state-changing routes; the four exceptions are correctly justified.", sev: "Pass", status: "Verified route by route" },
  { id: "BE-6", finding: "Rate limiting covers only 11 of 44 routes. Unthrottled authenticated mutations include invitation accept/decline, notification read, card pick writes, card lock, pool update and delete, game outcome, and the admin surfaces.", sev: "Medium", status: "Open" },
  { id: "BE-7", finding: "Only 5 routes validate input with a zod schema; the rest use ad-hoc type checks with no shared contract.", sev: "Medium", status: "Open" },
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
  "The reservation is not about any individual link. It is that the chain has never been pulled end to end against live Stripe and PayPal infrastructure. Idempotency that is correct by inspection is not the same as idempotency observed surviving a genuine duplicate webhook delivery."
));

children.push(findingsTable([
  { id: "BE-8", finding: "Stripe webhook verifies signature before parsing; fulfilment idempotent via transaction lookup plus unique index.", sev: "Pass", status: "Verified" },
  { id: "BE-9", finding: "Payout completion is idempotent; settlement credits balances atomically; per-pool fee lock prevents mid-pool re-splits.", sev: "Pass", status: "Verified" },
  { id: "BE-10", finding: "No end-to-end test of purchase → fulfilment → picks → settlement → payout against real Stripe/PayPal. Idempotency and failure handling are unproven under real conditions.", sev: "High", status: "Open" },
  { id: "BE-11", finding: "No reconciliation job comparing Stripe charges against pool_transactions, or PayPal batches against payout_requests. A silent divergence would go undetected indefinitely.", sev: "High", status: "Open" },
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
  "The performance linter reports 23 unused indexes, which is expected and not actionable on a database that has served no traffic — an index cannot register use before there are queries. It also reports multiple permissive policies on five tables, where an \"admin can view all\" policy sits alongside a \"user can view own\" policy for the same role and action. Postgres OR-es permissive policies, so both are evaluated on every read. This is a performance characteristic rather than a security defect, and consolidating each pair into one policy would remove it."
));

children.push(findingsTable([
  { id: "DB-1", finding: "RLS on every public table, backed by column-level grants on the money and identity columns.", sev: "Pass", status: "Verified live" },
  { id: "DB-2", finding: "Four SECURITY DEFINER advisor warnings, all intentional and documented in-database via COMMENT ON FUNCTION.", sev: "Pass", status: "Accepted exceptions" },
  { id: "DB-3", finding: "Multiple permissive SELECT policies on users, user_transactions, user_payout_accounts, payout_requests and payout_approvals — both evaluated per read.", sev: "Low", status: "Open — performance only" },
  { id: "DB-4", finding: "23 unused indexes reported. Expected on a zero-traffic database; re-evaluate after real usage rather than dropping now.", sev: "Low", status: "Informational" },
  { id: "DB-5", finding: "No documented backup, retention or restore-rehearsal policy for a database that will hold financial records.", sev: "High", status: "Open" },
]));

children.push(pageBreak());

// ── 7. Infrastructure ───────────────────────────────────────────────────────
children.push(H1("7.  Infrastructure and operations"));

children.push(H2("7.1  Build and continuous integration"));
children.push(P(
  "CI runs on every push and pull request and blocks a merge on three gates: typecheck, the settlement regression suite, and a full production build. Lint runs but is configured not to block, which was the right call while a large inherited backlog was being worked down — that backlog is now cleared and eslint currently reports zero findings, so the gate could be tightened to blocking without cost."
));
children.push(P(
  "The build itself runs through webpack rather than Turbopack. This was not a preference: Next 16.3.0's Turbopack build omits the Node file-trace manifest that Vercel's packaging step reads, and two production deploys failed on exactly that before the cause was isolated. The current production deployment is green."
));

children.push(H2("7.2  Scheduled work"));
children.push(P(
  "One Vercel cron invokes /api/cron/settle daily at 08:00 UTC, authenticated by a bearer secret that fails closed when unset. A single daily settlement pass is a product decision as much as a technical one — a pool whose last game ends Sunday evening will not settle until Monday morning, and players who expect to see winnings promptly will read that delay as a fault. Worth revisiting before launch."
));

children.push(H2("7.3  Observability"));
children.push(P(
  "There is none. No Sentry, no Datadog, no OpenTelemetry, no log aggregation, no uptime monitoring, no alerting. The entire diagnostic surface is 69 console statements landing in Vercel's log buffer, which nobody is watching and which nothing routes anywhere."
));
children.push(P(
  "For a money-moving system this is the single largest operational gap. The failures that matter most here are quiet ones: a webhook that starts returning 500 and silently stops issuing cards to paying customers; a PayPal batch that fails after the balance was already debited; a settlement run that credits the wrong figure. None of those announce themselves. Without instrumentation the detection mechanism is a user complaint, by which point the incident has already cost money and trust."
));

children.push(findingsTable([
  { id: "OPS-1", finding: "CI blocks merges on typecheck, settlement tests and build. Lint is clean and could now be promoted to blocking.", sev: "Pass", status: "Working" },
  { id: "OPS-2", finding: "No error tracking, structured logging, uptime monitoring or alerting of any kind.", sev: "High", status: "Open" },
  { id: "OPS-3", finding: "Upstash env vars unset in production, so rate limiting silently degrades to per-instance in-memory windows across serverless instances.", sev: "High", status: "Open" },
  { id: "OPS-4", finding: "Settlement runs once daily at 08:00 UTC; pools finishing Sunday evening do not settle until Monday.", sev: "Medium", status: "Open — product decision" },
  { id: "OPS-5", finding: "No runbook for the failure modes that matter: failed webhook, failed payout batch, mis-settled pool, Stripe or PayPal outage.", sev: "Medium", status: "Open" },
]));

children.push(H2("7.4  Testing"));
children.push(P(
  "One test exists: scripts/verify-settlement.ts, which exercises the scoring, tie-break and cent-exact pot split across 243 combinations. It is genuinely good, it runs in CI, and it has already caught a real regression when a merge reintroduced pre-audit payout mathematics."
));
children.push(P(
  "Everything else is untested. There is no unit test framework installed, no component testing, no API route tests, and no end-to-end harness. Forty-three of forty-four API routes have no automated coverage. The settlement suite protects the arithmetic; nothing protects the plumbing that feeds it."
));

children.push(findingsTable([
  { id: "OPS-6", finding: "Settlement regression suite (243 combinations) runs in CI and has caught a real payout-math regression.", sev: "Pass", status: "scripts/verify-settlement.ts" },
  { id: "OPS-7", finding: "No test framework, no component tests, no API route tests, no E2E harness. 43 of 44 routes uncovered.", sev: "High", status: "Open" },
]));

children.push(pageBreak());

// ── 8. Risk register ────────────────────────────────────────────────────────
children.push(H1("8.  Risk register"));
children.push(P("Open items ranked by consequence on a real-money product. Passed controls are omitted here; they appear in Sections 4 to 7."));

{
  const w = [700, 3500, 3400, 1760];
  children.push(table(w, [
    headerRow(["ID", "Risk", "Consequence if it lands", "Severity"], w),
    ...[
      ["OPS-3", "Rate limiting is per-instance, not distributed", "Credential stuffing against user accounts holding real balances is throttled far more weakly than intended", "High"],
      ["BE-10", "Money path never tested end to end", "A break anywhere in purchase → settlement → payout is found by a paying user, not by you", "High"],
      ["OPS-2", "No observability or alerting", "Silent failures — unissued cards, failed payouts, mis-settled pools — go undetected until someone complains", "High"],
      ["BE-11", "No payment reconciliation", "Divergence between Stripe/PayPal and your ledger accumulates invisibly", "High"],
      ["BE-4", "No MFA for admin accounts", "One phished admin credential can approve payouts and change platform fees", "High"],
      ["DB-5", "No documented backup and restore rehearsal", "Financial records with no proven recovery path", "High"],
      ["OPS-7", "43 of 44 routes have no automated tests", "Regressions reach production; refactoring is unsafe", "High"],
      ["FE-5", "No error boundaries anywhere", "A render error blanks the route; on a balance page users cannot tell a crash from lost money", "High"],
      ["BE-6", "Rate limiting missing on most authenticated mutations", "Unmetered write surface against the database", "Medium"],
      ["BE-7", "Inconsistent input validation", "Subtle parsing bugs; no shared contract to reason about", "Medium"],
      ["BE-3", "Breached-password check unavailable on current plan", "Users register with credentials already in public dumps", "Medium"],
      ["FE-8", "Accessibility unaudited", "Excludes users; carries legal exposure in several jurisdictions", "Medium"],
      ["OPS-4", "Daily-only settlement", "Winnings appear up to a day late; reads as a fault to players", "Medium"],
      ["OPS-5", "No incident runbook", "Slow, improvised response to money-affecting failures", "Medium"],
      ["FE-7", "Client errors never reach an operator", "Frontend breakage is invisible", "Medium"],
      ["DB-3", "Multiple permissive policies on five tables", "Extra policy evaluation on every read", "Low"],
      ["FE-6", "No loading boundaries", "Navigation feels unresponsive", "Low"],
      ["FE-9", "Sparse metadata; no sitemap or robots", "Weak search presence", "Low"],
      ["FE-10", "No static generation", "Marketing and legal pages pay full server cost", "Low"],
      ["DB-4", "23 unused indexes", "Marginal write overhead; re-evaluate after real traffic", "Low"],
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
  "Everything below is missing or unverified as of commit 49d074e. Section 9.A must be cleared before the platform holds a single real deposit; the rest is ordered by how much it will hurt to have skipped."
));

children.push(H2("9.A  Blocking — before real money moves"));
children.push(checklist([
  { req: "Provision Upstash Redis and set both env vars", why: "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are unset in production, so every throttle — including the sign-in limit protecting accounts with balances — degrades to a per-instance in-memory window that serverless scatters across processes.", pri: "Critical" },
  { req: "Execute the money path end to end in Stripe test mode", why: "Purchase → webhook → card issued → picks → settlement → balance credit → PayPal payout. This chain has never been run whole. Include a deliberately duplicated webhook delivery to prove idempotency under real conditions rather than by inspection.", pri: "Critical" },
  { req: "Verify the Stripe webhook endpoint and secret in the live dashboard", why: "STRIPE_WEBHOOK_SECRET must match the live endpoint. If the webhook is misconfigured a user is charged and receives no card — the exact failure the fulfilment code is written to prevent.", pri: "Critical" },
  { req: "Confirm PAYPAL_MODE is live and credentials are production", why: "The code refuses to fail open to sandbox, so a misconfiguration blocks payouts rather than faking them — but it must be set correctly before the first withdrawal request arrives.", pri: "Critical" },
  { req: "Stand up error tracking and alerting", why: "There is currently no way to learn that a webhook is failing or a payout batch was rejected other than a user telling you. Sentry or equivalent, with alerts on the money routes specifically.", pri: "Critical" },
  { req: "Document and rehearse database backup and restore", why: "Point-in-time recovery must be enabled and an actual restore performed once. Financial records with an unrehearsed recovery path are records you may not have.", pri: "Critical" },
  { req: "Enable MFA on all admin accounts", why: "Admins approve payouts and set the platform fee. One phished credential is currently sufficient to move money.", pri: "Critical" },
  { req: "Unset SETUP_SECRET once the admin account exists", why: "It gates a service-role write endpoint. Leaving it set after bootstrap leaves an unnecessary privileged path enabled.", pri: "High" },
  { req: "Build the payment reconciliation job", why: "Compare Stripe charges against pool_transactions and PayPal batches against payout_requests on a schedule. Without it, divergence between processor and ledger accumulates invisibly.", pri: "High" },
]));

children.push(H2("9.B  Security hardening"));
children.push(checklist([
  { req: "Extend rate limiting to the remaining authenticated mutations", why: "Invitation accept/decline, notification read, card pick writes, card lock, pool update/delete, game outcome and the admin routes are unthrottled.", pri: "Medium" },
  { req: "Move all route input onto zod schemas", why: "Only 5 of 44 routes validate against a schema; the rest hand-roll type checks with no shared contract and inconsistent error shapes.", pri: "Medium" },
  { req: "Enable Supabase leaked-password protection", why: "Requires a paid plan. Without it users may register with credentials already present in public breach dumps — on an account holding a cash balance.", pri: "Medium" },
  { req: "Add an admin action audit log", why: "Role changes, payout approvals and platform-fee edits should be attributable after the fact. Financial disputes are resolved from an audit trail.", pri: "Medium" },
  { req: "Consolidate the duplicate permissive SELECT policies", why: "Five tables evaluate an admin policy and an owner policy on every read. Merging each pair removes the overhead without changing behaviour.", pri: "Low" },
  { req: "Schedule a dependency vulnerability scan", why: "Advisories were cleared during this cycle, but nothing re-checks them. Dependabot or npm audit in CI keeps that honest.", pri: "Low" },
]));

children.push(H2("9.C  Reliability and testing"));
children.push(checklist([
  { req: "Install a test framework and cover the API routes", why: "43 of 44 routes have no automated coverage. Auth, ownership and the money endpoints are the priority order.", pri: "High" },
  { req: "Add an end-to-end harness", why: "Playwright is already available in this environment. Signup, purchase, picks, settlement and withdrawal are the journeys that must never silently break.", pri: "High" },
  { req: "Add error.tsx and global-error.tsx boundaries", why: "No boundary exists anywhere. An unhandled render error currently blanks the route — and on a balance page, users cannot distinguish a crash from missing money.", pri: "High" },
  { req: "Write an incident runbook", why: "Failed webhook, failed payout batch, mis-settled pool, Stripe or PayPal outage, database restore. Decide the response before the incident, not during it.", pri: "Medium" },
  { req: "Promote lint to a blocking CI gate", why: "The backlog it was relaxed for is cleared and eslint now reports zero findings, so blocking costs nothing and stops the debt returning.", pri: "Low" },
  { req: "Add loading.tsx boundaries", why: "No route-level suspense fallbacks, so navigation has no server-driven loading state.", pri: "Low" },
  { req: "Reconsider the daily-only settlement schedule", why: "A pool finishing Sunday evening does not settle until Monday morning. Players read that delay as a fault.", pri: "Medium" },
]));

children.push(H2("9.D  Frontend and user experience"));
children.push(checklist([
  { req: "Run an accessibility audit", why: "Never audited. Radix supplies good primitive semantics, but 24 aria-labels and 5 roles across 83 files is not evidence of a keyboard- or screen-reader-usable product.", pri: "Medium" },
  { req: "Add automated a11y checks to CI", why: "axe or similar, so the audit result does not decay the moment it is signed off.", pri: "Low" },
  { req: "Complete page metadata; add sitemap.ts and robots.ts", why: "Only 5 of 20 pages define metadata, and search engines have no crawl guidance.", pri: "Low" },
  { req: "Recover static generation for public pages", why: "force-dynamic is global for the CSP nonce. Serving marketing and legal pages a nonce-free CSP would let them cache at the edge.", pri: "Low" },
  { req: "Verify the httpOnly session change against live Supabase realtime", why: "Chat now authenticates through a separate short-lived token path. The mechanism is sound but has not been exercised against the live realtime service.", pri: "Medium" },
]));

children.push(H2("9.E  Operational readiness"));
children.push(checklist([
  { req: "Structured logging with request correlation", why: "69 console statements cannot be searched, correlated or alerted on. Tracing one user's payment across routes is currently not possible.", pri: "High" },
  { req: "Uptime and health-check monitoring", why: "Nothing currently detects that the site is down or the cron stopped firing.", pri: "High" },
  { req: "Alert on settlement and payout failures specifically", why: "These are the failures that cost money and trust. They deserve their own alerts, not a shared error feed.", pri: "High" },
  { req: "Define support and dispute-resolution process", why: "A player will contest a settlement result. Decide now who investigates, against what evidence, and who can authorise a correction.", pri: "Medium" },
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
children.push(P("All 44 routes, with the guards each enforces. ✓ present, — absent, n/a not applicable."));

const routes = [
  ["admin/payout-requests", "GET", "n/a", "—", "n/a", "requireAdmin"],
  ["admin/payout-requests/[id]/complete", "PATCH", "✓", "—", "—", "requireAdmin + idempotent"],
  ["admin/pools/[poolId]/settings", "PUT", "✓", "—", "—", "requireAdmin"],
  ["admin/sync/teams", "POST", "✓", "—", "n/a", "requireAdmin"],
  ["admin/users", "GET", "n/a", "—", "n/a", "requireAdmin"],
  ["admin/users/[userId]/role", "PATCH", "✓", "—", "—", "requireAdmin"],
  ["auth/me", "GET", "n/a", "—", "n/a", "Session"],
  ["auth/realtime-token", "GET", "n/a", "—", "n/a", "getUser(); access token only"],
  ["auth/signin", "POST", "✓", "✓", "✓", "Public"],
  ["auth/signout", "POST", "✓", "—", "n/a", "Session"],
  ["auth/signup", "POST", "✓", "✓", "✓", "Public; no enumeration"],
  ["cron/settle", "GET", "n/a", "—", "n/a", "CRON_SECRET, fails closed"],
  ["games", "GET", "n/a", "—", "n/a", "Public read"],
  ["games/[gameId]", "GET", "n/a", "—", "n/a", "Public read"],
  ["games/[gameId]/outcome", "PUT", "✓", "—", "✓", "requireAdmin"],
  ["invitations", "GET", "n/a", "—", "n/a", "Session + RLS"],
  ["invitations/[id]/accept", "POST", "✓", "—", "—", "Session + RLS"],
  ["invitations/[id]/decline", "POST", "✓", "—", "—", "Session + RLS"],
  ["me/balance", "GET", "n/a", "—", "n/a", "Session + RLS"],
  ["me/claim-payout", "POST", "✓", "✓", "—", "Session; RPC uses auth.uid()"],
  ["me/games", "GET", "n/a", "—", "n/a", "Session + RLS"],
  ["me/payout-account", "GET, PUT", "✓", "✓", "—", "Session + RLS"],
  ["me/payout-request", "GET, POST", "✓", "✓", "—", "Session; balance-checked in RLS"],
  ["me/winnings", "GET", "n/a", "—", "n/a", "Session + RLS"],
  ["newsletter/subscribe", "POST", "n/a", "✓", "✓", "Public; no enumeration"],
  ["nfl/scoreboard", "GET", "n/a", "—", "n/a", "Mock feed for local dev"],
  ["notifications/[id]/read", "PUT", "✓", "—", "—", "Session + RLS"],
  ["pools", "GET, POST", "✓", "✓", "—", "Admin-only create"],
  ["pools/[poolId]", "GET, PATCH, DELETE", "✓", "—", "—", "Session + RLS"],
  ["pools/[poolId]/cards", "GET", "n/a", "—", "n/a", "Session + RLS"],
  ["pools/[poolId]/cards/[cardId]/lock", "POST", "✓", "—", "—", "Session + RLS"],
  ["pools/[poolId]/cards/[cardId]/picks", "GET, POST", "✓", "—", "✓", "Session; kickoff lock in RLS"],
  ["pools/[poolId]/cards/[cardId]/submit", "POST", "n/a", "n/a", "n/a", "RETIRED — 410"],
  ["pools/[poolId]/cards/purchase", "POST", "n/a", "n/a", "n/a", "RETIRED — 410"],
  ["pools/[poolId]/chat", "GET, POST", "✓", "✓", "—", "Session; card holders only"],
  ["pools/[poolId]/games/sync", "POST", "✓", "✓", "—", "requireAdmin"],
  ["pools/[poolId]/invitations", "POST", "✓", "—", "✓", "Session; owner only"],
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
children.push(P("Six commits merged to main as PR #1, all verified against the live database and a green production deploy."));

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

children.push(spacer(240));
children.push(P(
  "Read together, these commits describe a system whose security model is now sound and whose remaining work is operational. That is a good place to be — but the operational work is not optional on a product that holds other people's money, and Section 9.A is where it starts.",
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
            children: ["Sports Pool — Full-Stack Audit  |  commit 49d074e  |  Page ", PageNumber.CURRENT],
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
