const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  PageBreak, TableOfContents, LevelFormat,
} = require("docx");
const fs = require("fs");

const NAVY = "1F3864";
const BLUE = "2E4A7A";
const GREEN = "1E7A3E";
const RED = "B22222";
const AMBER = "B8860B";
const GREY = "595959";
const MONO = "Consolas";

const H1 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 140 } });
const H2 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 } });
const H3 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_3, spacing: { before: 170, after: 70 } });

function P(text, o = {}) {
  return new Paragraph({
    spacing: { after: o.after ?? 130, line: 280 },
    alignment: o.align,
    children: [new TextRun({ text, size: 21, color: o.color, bold: o.bold, italics: o.italics })],
  });
}
function runs(kids, o = {}) {
  return new Paragraph({ spacing: { after: o.after ?? 130, line: 280 }, alignment: o.align, children: kids });
}
const T = (t, o = {}) => new TextRun({ text: t, size: o.size ?? 21, bold: o.bold, italics: o.italics, color: o.color, font: o.font });
const M = (t) => new TextRun({ text: t, font: MONO, size: 18, color: "1A4D2E" });

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "b", level },
    spacing: { after: 85, line: 272 },
    children: Array.isArray(text) ? text : [new TextRun({ text, size: 21 })],
  });
}
function numbered(text) {
  return new Paragraph({
    numbering: { reference: "n", level: 0 },
    spacing: { after: 95, line: 272 },
    children: Array.isArray(text) ? text : [new TextRun({ text, size: 21 })],
  });
}
function code(lines) {
  const arr = Array.isArray(lines) ? lines : [lines];
  return arr.map((ln, i) => new Paragraph({
    spacing: { after: i === arr.length - 1 ? 130 : 0, line: 236 },
    shading: { type: ShadingType.CLEAR, fill: "F6F8FA" },
    border: { left: { style: BorderStyle.SINGLE, size: 14, color: "C4CDD5", space: 8 } },
    children: [new TextRun({ text: ln.length ? ln : " ", font: MONO, size: 17, color: "24292E" })],
  }));
}
const cB = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" }, right: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
};
function cell(content, { width, fill, header, mono, bold, color } = {}) {
  const arr = Array.isArray(content) ? content : [content];
  const kids = arr.map((c) => typeof c === "string"
    ? new Paragraph({ spacing: { after: 0, line: 254 }, children: [new TextRun({ text: c, size: 18, bold: header || bold, color: header ? "FFFFFF" : color, font: mono ? MONO : undefined })] })
    : c);
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    margins: { top: 60, bottom: 60, left: 95, right: 95 },
    borders: cB, children: kids,
  });
}
function table(colW, headers, rows, opts = {}) {
  const total = colW.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: colW,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { width: colW[i], fill: NAVY, header: true })) }),
      ...rows.map((r, ri) => new TableRow({
        children: r.map((c, i) => {
          const isObj = c && typeof c === "object" && !Array.isArray(c) && c.text !== undefined;
          return cell(isObj ? c.text : c, {
            width: colW[i],
            fill: ri % 2 ? "F4F6FA" : undefined,
            mono: opts.monoCols && opts.monoCols.includes(i),
            color: isObj ? c.color : undefined,
            bold: isObj ? c.bold : undefined,
          });
        }),
      })),
    ],
  });
}
function note(title, body, fill = "FBF3E6", bar = AMBER) {
  return new Table({
    width: { size: 8900, type: WidthType.DXA }, columnWidths: [8900],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: 8900, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill },
      margins: { top: 115, bottom: 115, left: 155, right: 155 },
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 18, color: bar } },
      children: [
        new Paragraph({ spacing: { after: 45 }, children: [new TextRun({ text: title, bold: true, size: 20, color: NAVY })] }),
        new Paragraph({ spacing: { after: 0, line: 274 }, children: Array.isArray(body) ? body : [new TextRun({ text: body, size: 20 })] }),
      ],
    })]})],
  });
}
/** Checklist row: ☐ + text + owner column. */
function checklist(items) {
  return table(
    [420, 6180, 2300],
    ["", "Item", "Notes"],
    items.map((it) => [
      { text: "☐", bold: true },
      it[0],
      it[1] ?? "",
    ])
  );
}

const c = [];

/* ─────────────── Cover ─────────────── */
c.push(
  new Paragraph({ spacing: { before: 1450, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Gridiron", bold: true, size: 66, color: NAVY })] }),
  new Paragraph({ spacing: { before: 80, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "NFL Sports Pool Platform", size: 32, color: BLUE })] }),
  new Paragraph({ spacing: { before: 140, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Project Handover Document", size: 28, color: GREY })] }),
  new Paragraph({ spacing: { before: 40, after: 420 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Architecture · Security · Operations · Handover Checklist", size: 21, italics: true, color: GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 10 } },
    spacing: { before: 160, after: 300 }, children: [new TextRun({ text: "", size: 2 })] }),
);
c.push(table([2500, 6300], ["Field", "Detail"], [
  ["Document", "Project handover — explanation, architecture, and readiness checklist"],
  ["Date", "20 August 2026 (supersedes the 13 August edition)"],
  ["Repository", "markravencanete50-source/sports_pool — main @ b279d97"],
  ["Product", "Real-money NFL prediction pools (parlay cards, prize pots, payouts)"],
  ["Stack", "Next.js 16.3 · TypeScript 6 · Supabase (Postgres + RLS) · Stripe · PayPal · Vercel or self-hosted Docker"],
  ["Scale", "53 API routes · 34 migrations · 26 tables · 63 components · 25 pages · ~25,700 lines TS/TSX"],
  ["Production", "Deployed and verified live on Vercel; now being retargeted to a self-hosted Docker stack on a client-operated VPS. Both paths are covered in §10.1"],
  ["Status", { text: "Handover-ready. Every remaining item is a production credential, a legal opinion, or a processor approval — none is application code. See §10.", bold: true }],
]));
c.push(new Paragraph({ children: [new PageBreak()] }));

/* ─────────────── TOC ─────────────── */
c.push(H1("Contents"));
c.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));
c.push(new Paragraph({ children: [new PageBreak()] }));

/* ─────────────── 1. Executive summary ─────────────── */
c.push(H1("1. Executive summary"));
c.push(P("Gridiron is a real-money sports-pool platform. Players buy parlay cards for a pool of NFL games, predict the outcomes, and the platform automatically scores the results and pays the winners from the prize pot, less a platform fee."));
c.push(P("Because real money moves through the system — card payments in via Stripe, winnings credited to an in-app balance, withdrawals out via PayPal — the engineering standard applied throughout is that the database, not the application, is the authorization boundary. An application bug alone must not be sufficient to leak data or move money."));
c.push(H3("Readiness at handover"));
c.push(table([3200, 1500, 4100], ["Gate", "Status", "Detail"], [
  ["TypeScript (tsc --noEmit)", { text: "PASS", color: GREEN, bold: true }, "0 errors, TypeScript 6"],
  ["Migration pipeline guard", { text: "PASS", color: GREEN, bold: true }, "34 migrations, all versions unique and well-formed"],
  ["Vercel cron config guard", { text: "PASS", color: GREEN, bold: true }, "Blocks the schedule class that silently stops deployments"],
  ["Unit tests", { text: "PASS", color: GREEN, bold: true }, "34 tests: guard layer, schemas, age gate, HIBP"],
  ["Settlement regression sweep", { text: "PASS", color: GREEN, bold: true }, "Scoring, tie-breaks, 243 rounding combinations"],
  ["Production build (next build)", { text: "PASS", color: GREEN, bold: true }, "All routes compile"],
  ["ESLint", { text: "PASS", color: GREEN, bold: true }, "0 errors, incl. 21 jsx-a11y rules at error severity"],
  ["Dependency vulnerability scan", { text: "PASS", color: GREEN, bold: true }, "npm audit --audit-level=high, blocking in CI"],
  ["End-to-end smoke (live)", { text: "PASS", color: GREEN, bold: true }, "13 of 13 against production"],
]));
c.push(new Paragraph({ spacing: { after: 80 } }));
c.push(note("The most important finding of the whole project",
  [T("Nothing the compliance cycle built had ever reached users. ", { bold: true }),
   T("Five merged commits produced no Vercel deployment at all. Not failed builds: no builds. This project runs on the Vercel Hobby plan, where a cron schedule finer than daily does not degrade gracefully - it makes Vercel REFUSE to create the deployment. One commit changed settlement from daily to hourly, and every commit after it silently stopped shipping while CI stayed green and the dashboard showed a healthy production deployment of eight-day-old code. "),
   T("The lesson is the failure mode, not the mistake: every signal a team normally trusts was green. That class of bug is now blocked by scripts/check-vercel-crons.ts in CI, and production is verified live. See section 9."),
   T("Second: a required environment variable was unset in production for eight days. ", { bold: true }),
   T("Settlement could not complete and the Stripe webhook could not fulfil a purchase - a player could be charged and receive nothing - while the public site served normally. That asymmetry is why nobody noticed. A health probe now answers this in one request, and an error digest escalates it.")],
  "FBECEC", RED));

c.push(note("Earlier cycles, for completeness",
  [T("1. Card purchases were broken end-to-end on any database provisioned from the committed migrations. ", { bold: true }),
   T("Two columns on "), M("pool_transactions"), T(" are "), M("NOT NULL"), T(" with no default, the trigger meant to populate them existed in no migration, and the purchase code supplied neither — so the insert failed, the card was rolled back, and the player was charged by Stripe and received nothing."), new TextRun({ break: 1 }), new TextRun({ break: 1 }),
   T("2. A crafted pool could mint prize money. ", { bold: true }),
   T("The platform fee is multiplied into the payout, and the column that holds it was writable on insert and unclamped — a pool created with a fee of −100 would have paid out twice its pot. Both are fixed; see §9.")],
  "FBECEC", RED));

/* ─────────────── 2. What the product does ─────────────── */
c.push(H1("2. What the product does"));
c.push(P("The domain has three core objects:"));
c.push(bullet([T("Pool", { bold: true }), T(" — a contest over a slate of 6–9 NFL games from a single week, with a fixed entry fee. Pools are public (anyone may join) or private (invitation only).")]));
c.push(bullet([T("Parlay card", { bold: true }), T(" — a paid entry. A player may hold up to three per pool, each with its own set of predictions.")]));
c.push(bullet([T("Prize pot", { bold: true }), T(" — the sum of entry fees. At settlement the platform fee is deducted and the remainder is split between the winners.")]));

c.push(H2("2.1 The player journey"));
c.push(numbered([T("Sign up", { bold: true }), T(" — email and password via Supabase Auth (minimum 10 characters, mixed case and a digit).")]));
c.push(numbered([T("Browse and join", { bold: true }), T(" — choose a pool and pay the entry fee through Stripe Checkout. The price is fixed by the pool server-side; the client cannot influence it.")]));
c.push(numbered([T("Receive a card", { bold: true }), T(" — issued only after Stripe confirms the payment. The webhook is the source of truth, so a closed tab or lost connection cannot cost a player their entry.")]));
c.push(numbered([T("Make predictions", { bold: true }), T(" — pick each game's outcome plus a total-score tiebreaker. Picks stay editable until that game kicks off, then lock.")]));
c.push(numbered([T("Games are played", { bold: true }), T(" — final scores are pulled automatically from the ESPN scoreboard feed.")]));
c.push(numbered([T("Settlement", { bold: true }), T(" — once every game in the pool has finished, all cards are scored, the winner (or winners) determined, and their share credited to their balance.")]));
c.push(numbered([T("Withdrawal", { bold: true }), T(" — the player links a PayPal address and requests a payout; an administrator approves it and the funds are sent.")]));

c.push(H2("2.2 How a winner is decided"));
c.push(P("A card is eligible only if it has a pick for every finished game in the pool. Cards are ranked by percentage of correct predictions. Ties are broken by the smallest total error across total-score predictions; a card that supplied no total-score prediction is treated as worst-case so it cannot win a tie by default. Where a genuine tie remains, the pot is split."));
c.push(P("Cancelled or postponed games count as correct for every player, so a disrupted fixture cannot arbitrarily eliminate anyone."));
c.push(note("Money precision",
  [T("The pot is divided in integer cents, with any indivisible remainder distributed one cent at a time in a deterministic order. Payouts therefore sum to exactly the net pot for every pot size and winner count — verified by an automated sweep across 243 combinations.")],
  "EAF2EA", GREEN));

/* ─────────────── 3. Architecture ─────────────── */
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(H1("3. Architecture"));
c.push(P("Gridiron is a single Next.js application. There is no separate backend service: the API is a set of App Router route handlers that execute server-side, deployed as serverless functions."));
c.push(table([2400, 6400], ["Component", "Role"], [
  ["Next.js 16 (App Router)", "UI and API in one deployment. Route handlers under src/app/api are the backend."],
  ["Supabase Postgres", "System of record. Row Level Security is the authorization boundary."],
  ["Supabase Auth (GoTrue)", "Identity. JWT delivered in HTTP-only cookies."],
  ["Stripe", "Card payments in. The webhook is the authoritative fulfilment trigger."],
  ["PayPal Payouts", "Withdrawals out."],
  ["ESPN scoreboard API", "Fixtures, live status and final scores."],
  ["Scheduled jobs", "Settlement and payment reconciliation. On Vercel: vercel.json crons plus GitHub Actions. Self-hosted: the settle-cron and reconcile-cron compose services. See §10.1."],
  ["Upstash Redis (optional)", "Shared-store rate limiting across serverless instances."],
]));

c.push(H2("3.1 The two database clients"));
c.push(P("Choosing correctly between these is the backbone of the access-control model, and is the first thing to check in any review:"));
c.push(table([2700, 6100], ["Client", "Semantics"], [
  ["createClient() — src/lib/supabase/server.ts", "Bound to the request cookies; runs as the signed-in user (or anonymous). RLS applies. The default for anything user-facing."],
  ["createAdminClient() — src/lib/supabase/admin.ts", "Service-role. Bypasses RLS entirely. Permitted only where there is no user session (Stripe webhook, cron) or immediately after an explicit authorization gate."],
]));

c.push(H2("3.2 Request lifecycle"));
c.push(...code([
  "1. Route handler invoked",
  "2. supabase = await createClient()             // cookie-bound session client",
  "3. supabase.auth.getUser()                     // verify the JWT",
  "4. not signed in -> 401",
  "5. authorize: bind the object to the caller, and/or requireAdmin()",
  "6. validate: zod .parse() / .safeParse() on body and params",
  "7. guards: assertSameOrigin() + rate limit on money mutations",
  "8. execute under RLS  (or service-role, only after step 5)",
  "9. RLS independently re-checks the same rule in the database",
]));

/* ─────────────── 4. Repository structure ─────────────── */
c.push(H1("4. Repository structure"));
c.push(...code([
  "src/",
  "├── app/",
  "│   ├── (marketing)/        public landing, terms, privacy, contact",
  "│   ├── (auth)/             login, signup, auth/callback",
  "│   ├── (app)/              dashboard, pools, my-games, winnings, admin",
  "│   └── api/                43 route handlers — this is the backend",
  "├── components/             62 components, grouped by feature",
  "├── lib/",
  "│   ├── hooks/              React Query data hooks",
  "│   ├── supabase/           server (RLS) + admin (service-role) clients",
  "│   ├── winners.ts             scoring and pot split        <- money",
  "│   ├── settle-pools.ts        settlement pipeline          <- money",
  "│   ├── materialize-winners.ts winner persistence           <- money",
  "│   ├── fulfill-card-purchase.ts Stripe fulfilment          <- money",
  "│   ├── rate-limit.ts          Upstash + in-memory limiter",
  "│   ├── request-guards.ts      CSRF / same-origin",
  "│   └── validations.ts         Zod schemas",
  "└── proxy.ts                route protection (Next 16 renamed middleware.ts)",
  "",
  "supabase/migrations/        34 files — the source of truth for the database",
  "scripts/                    seeds + the settlement regression suite",
  ".github/workflows/          ci.yml (7 gates) + settle-pools.yml + alert.yml",
]));
c.push(note("Files that are deliberately not authoritative",
  [M("schema.sql"), T(" is a stale early snapshot missing the entire money subsystem — never provision from it. "),
   M("src/lib/supabase/types.ts"), T(" is generated but both out of date and unwired (the clients do not use the "), M("Database"), T(" generic), so it does not actually type-check queries. Both carry warning headers in the code.")],
  "FBF3E6", AMBER));

/* ─────────────── 5. Data model ─────────────── */
c.push(H1("5. Data model"));
c.push(table([2400, 6400], ["Table", "Role and sensitivity"], [
  ["users", "Profile, role and cash balance. Own-row read only; role and balance are immutable from the client."],
  ["pools / pool_games / pool_participants", "Pool definition, its slate, and membership. Participation gates private-pool access."],
  ["parlay_cards / card_picks", "A player's paid entry and their predictions. The strictest privacy requirement in the product: holder-only."],
  ["pool_transactions", "Entry payments; feeds the prize pot. Service-role writes only, with a unique constraint on the Stripe session."],
  ["pool_winners / payout_approvals", "Materialised settlement results and claim state."],
  ["payout_requests", "Withdrawal requests. The player may insert their own, bounded by their balance in RLS; status transitions are service-role only."],
  ["user_transactions", "Append-only ledger of every balance movement. A unique index prevents crediting the same pool win twice."],
  ["comments", "Pool chat, restricted to card holders and participants."],
  ["games / teams", "Reference data and live scores. Admin-only writes, because scores decide the money."],
  ["platform_settings", "Platform fee percentage and minimum entry fee."],
  ["user_compliance", "Per-player regulatory state: date of birth, KYC status, deposit and pending limits, self-exclusion and cooling-off expiry. Written only through SECURITY DEFINER RPCs that derive identity from the session, never by a client UPDATE."],
  ["compliance_settings", "Operator-set thresholds — minimum age, KYC trigger amount, limit cooling-off period. Deliberately data, not code: changing a threshold is a row update, not a redeploy."],
  ["jurisdiction_rules", "Which territories may play, keyed by country and region. Ships as a conservative placeholder explicitly marked as such. Applying counsel's answer is an UPDATE here."],
  ["compliance_events", "Append-only record of every compliance decision: what was attempted, the verdict, the reason, and the resolved jurisdiction. This is the evidence in a regulatory question."],
  ["admin_audit_log", "Actor, action, target and before/after state for every privileged write — payout completion, platform-fee change, role change, MFA enrolment. Financial disputes are resolved from an audit trail."],
  ["app_errors", "Server money-path failures, client crashes and reconciliation mismatches. Service-role only: RLS enabled with zero policies and zero client grants. Watched by the alert digest."],
]));
c.push(note("The compliance layer is enforced in the database, not the UI",
  [T("Age, jurisdiction, self-exclusion, deposit limits and KYC thresholds are re-checked server-side at every money boundary, and the state that drives them is only writable through SECURITY DEFINER functions. A self-exclusion can be extended but never shortened - "),
   T("greatest()", { font: MONO }),
   T(" makes that a property of the function rather than a rule someone must remember. This was tested adversarially against the live database: an explicit attempt to cut a 365-day exclusion left it unchanged.")],
  "EAF2EA", GREEN));

c.push(H2("5.1 Database functions"));
c.push(P("Money never moves through a read-then-write in application code. It moves through these, so concurrent callers serialise on a row lock:"));
c.push(table([2900, 5900], ["Function", "Purpose"], [
  ["debit_user_balance", "Single conditional UPDATE ... WHERE balance >= amount. Returns NULL when funds are insufficient — the caller must treat NULL as 'do not send money'."],
  ["credit_user_balance", "Relative increment, so a concurrent change is never clobbered."],
  ["claim_pool_payout", "Runs an entire winnings claim in one transaction, deriving the claimant from auth.uid() rather than a client-supplied id."],
  ["get_pool_financials / get_pools_financials", "Computes prize pot and participant counts from completed transactions."],
  ["get_public_winners", "Public ticker projection — completed pools only, no user identifiers."],
  ["is_admin", "Central role check used by RLS policies."],
]));

/* ─────────────── 6. Critical flows ─────────────── */
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(H1("6. Critical server flows"));

c.push(H2("6.1 Buying a card"));
c.push(...code([
  "POST /api/stripe/create-checkout-session",
  "  auth -> zod -> load pool",
  "  price = pool.entry_fee            <- server-authoritative, never the client's",
  "  checks: pool open, < 3 cards held, capacity, >= platform minimum",
  "  stripe.checkout.sessions.create({ metadata: { poolId, userId, entryFee } })",
  "",
  "Stripe -> POST /api/stripe/webhook          [SOURCE OF TRUTH]",
  "  verify signature over the RAW body; re-retrieve the session from Stripe",
  "  fulfillCardPurchase(serviceRole, session)",
  "",
  "Browser returns -> POST /api/stripe/confirm-payment    [fast path]",
  "  assert session.metadata.userId === caller  (else 403)",
  "  fulfillCardPurchase(...)                   // same function, idempotent",
  "",
  "fulfillCardPurchase:",
  "  require payment_status === 'paid'",
  "  require amount_total === round(entryFee * 100)   // trust Stripe, not metadata",
  "  idempotency (a) lookup on stripe_session_id",
  "              (b) UNIQUE constraint; violation is treated as success",
  "  insert parlay_card + pool_transaction (fee set by DB trigger)",
]));
c.push(P("The two callers can race. Layer (b) is what makes that safe: without the unique constraint both could pass the lookup and issue two cards for one payment."));

c.push(H2("6.2 Settlement"));
c.push(...code([
  "GET /api/cron/settle       [CRON_SECRET, fails closed with 503 if unset]",
  "",
  "1. refreshGameScores()",
  "     for each pending (season, week): pull finals from ESPN",
  "     never write 'finished' without both scores",
  "2. settleReadyPools()",
  "     completePoolIfAllGamesFinished()   <- the slate must be whole",
  "     refuse to settle a zero pot that has paid cards (warn instead)",
  "3. materializePoolWinners()",
  "     score card_picks against finished games",
  "     split the net pot in exact cents; insert pool_winners + approvals",
  "     credit balances atomically; idempotent via a unique ledger index",
]));
c.push(note("Why the ordering is not negotiable",
  [T("Phase 3 must never run before phase 2. Scoring only considers finished games, so on a partial slate it would crown whoever happened to lead after the early kickoffs and pay out the entire pot. The pool-completed gate is what makes the slate whole.")],
  "FBECEC", RED));

c.push(H2("6.3 Withdrawal"));
c.push(...code([
  "POST /api/me/payout-request      auth + same-origin + rate limit",
  "  amount >= minimum, balance >= amount, PayPal account linked",
  "  insert status 'pending'   (RLS also caps amount <= actual balance)",
  "",
  "PATCH /api/admin/payout-requests/[id]/complete     requireAdmin",
  "  idempotency check on the ledger reference",
  "  1. debit_user_balance(...)      <- RESERVE atomically, before any money moves",
  "  2. createPayPalPayout(...)      <- send only if the reservation succeeded",
  "  3. on PayPal failure: credit_user_balance(...)   (compensate)",
  "  4. on success: mark completed, then write the audit row best-effort",
]));
c.push(P("Reserve, then send, then compensate. The reverse order — sending first and checking the balance afterwards — allowed concurrent approvals to each pay out before any of them verified funds."));

/* ─────────────── 7. Security ─────────────── */
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(H1("7. Security model"));
c.push(P("Seven layers of defence in depth. Each independently stops its class of attack, so a single-layer failure is not exploitable."));
c.push(table([500, 2500, 5800], ["#", "Layer", "Mechanism"], [
  ["1", "Authentication", "Supabase JWT in HTTP-only cookies, verified server-side on every protected handler. Password policy enforced by Zod."],
  ["2", "Authorization", "requireAdmin() for role gates; every object bound to the caller in the query, so a foreign id returns 404 rather than someone else's data."],
  ["3", "Row Level Security", "Holder-only cards and picks; own-row profiles with role and balance pinned; money tables closed to client writes. The migration ends with an assertion that fails if an unexpected SELECT policy exists."],
  ["4", "Money integrity", "Server-set prices, Stripe signature verification, two-layer idempotency, atomic balance RPCs, cent-exact splits."],
  ["5", "Game integrity", "Picks are private to the holder and lock at kickoff — enforced in the API and mirrored in RLS."],
  ["6", "Secrets & automation", "requireSecret() fails closed and compares timing-safely; scheduled jobs and admin bootstrap are secret-gated."],
  ["7", "Input & transport", "Zod validation, UUID checks, PostgREST filter sanitisation, rate limiting, same-origin (CSRF) checks, CSP and security headers."],
]));
c.push(note("The permissive-OR pitfall — worth knowing before editing any policy",
  [T("Postgres RLS policies are permissive and OR-ed together, so one loose policy silently defeats every strict policy beside it. That is exactly how card privacy was lost originally: a single broad SELECT policy exposed every opponent's picks. The hardening migration therefore drops the known-bad policies "),
   T("and then asserts the end state", { bold: true }), T(", raising an exception that rolls the migration back if anything unexpected survives.")],
  "EAF2FB", BLUE));
c.push(H3("Attack classes explicitly tested and defended"));
c.push(P("Free or unpaid cards · entry-fee tampering · double fulfilment races · confirming another player's payment session · self-promotion to admin · rewriting a final score to choose the winner · self-settling a pool · reading opponents' picks · submitting a pick after kickoff · withdrawing more than the balance · draining the float via concurrent payout approvals · joining a private pool uninvited · harvesting the user table · triggering settlement anonymously · forging a Stripe webhook · open redirect · filter injection · SSRF and prompt injection through chat moderation."));

/* ─────────────── 8. Quality gates ─────────────── */
c.push(H1("8. Quality gates and CI"));
c.push(P("Continuous integration runs on every push to main and every pull request, and blocks the merge on all seven gates:"));
c.push(table([2400, 6400], ["Gate", "Why it blocks"], [
  ["npm run typecheck", "Catches real breakage — wrong shapes, dead symbols, bad refactors."],
  ["npm run check:migrations", "Supabase keys applied migrations by the numeric filename prefix, so two files sharing a prefix are ONE migration to the ledger and the second is silently skipped. Three prefixes were duplicated here. Production survived it (those changes had been applied by hand under other names), but a fresh provision would have come up missing three migrations' worth of RPCs and grants while reporting success."],
  ["npm run check:crons", "The gate that would have prevented the project's worst incident. Blocks any sub-daily cron schedule in vercel.json, and any unknown top-level key — both make Vercel refuse a deployment outright on the Hobby plan, producing no build and no error to read."],
  ["npm test", "The money path: scoring, tie-breaks and the cent-exact split, plus 34 unit tests over the shared guard layer. A failure here is a release blocker."],
  ["npm run build", "Last defence against a failure that would only appear at deploy time."],
  ["npm run lint", "Blocking, including 21 jsx-a11y rules at error severity."],
  ["npm audit --audit-level=high", "Advisories were cleared by hand once and nothing re-checked them. Dependabot proposes the upgrades weekly, grouped so the PR is small enough to be read, with Next and the money/auth packages isolated."],
]));
c.push(runs([T("Run everything locally with "), M("npm run check"), T(" before pushing.")]));

c.push(H2("8.1 The end-to-end smoke suite"));
c.push(runs([T("Separately from CI, "), M("tests/e2e/smoke.test.ts"), T(" runs black-box against a RUNNING deployment — preview, staging or production:")]));
c.push(runs([M("E2E_BASE_URL=https://<your-domain> npm run test:e2e")]));
c.push(P("It asserts the CSP carries a nonce and no unsafe-inline, that framing is denied and sniffing disabled, the health endpoint's two response shapes, anonymous rejection on four money routes, that a cross-origin state change is refused, that the retired card endpoints still answer 410 rather than 404, and that an unknown API path 404s across every HTTP method."));
c.push(P("Without E2E_BASE_URL every test SKIPS rather than fails, so it can never become a green test that checks nothing. It found a real production defect on its first run: unmatched API paths were answering HTTP 200 with HTML to any non-GET method, so a client posting to a renamed money endpoint saw a success."));
c.push(note("What this suite is NOT",
  [T("It is not the money-path run. Purchase, webhook, card issue, picks, settlement and payout against real Stripe and PayPal test infrastructure has never been executed end to end, and needs live test-mode credentials. Nor is it a browser test — there is no DOM, so keyboard and screen-reader behaviour remain a manual pass. Stating both boundaries matters: a smoke suite mistaken for full coverage is worse than none, because it retires a risk that is still live.")],
  "FFF4E5", "8A5A00"));

/* ─────────────── 9. What the audit changed ─────────────── */
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(H1("9. What the audit changed"));
c.push(P("A staged audit — security, then correctness, then handover readiness — was run across the backend, frontend, database and build. Findings were adversarially verified before any change was made. The material fixes:"));

c.push(H2("9.1 Critical"));
c.push(table([2900, 5900], ["Issue", "Resolution"], [
  ["Card purchases failed on any rebuilt database, charging the player and issuing nothing", "platform_fee / net_amount were NOT NULL with no default and no trigger supplied them. Migration 20260807000001 adds the defaults and creates the trigger, which also finally records the platform's cut per sale."],
  ["A crafted pool could mint prize money", "The pool's fee percentage is multiplied into the payout, and the column was writable on insert and never clamped, so a negative value paid out more than the pot. The fee is now stamped unconditionally by trigger, constrained to 0–100 by the database, and clamped again in code before use."],
  ["A settled pool could be made to pay its pot a second time", "Three things lined up: a card could still be activated after its pool had settled, the winnings page re-ran settlement for any pool where the viewer had no winner row, and re-running deletes and rewrites the winners without reversing money already paid. A player could therefore fill in picks, never lock the card, wait for the results, then activate it and be paid — while the original winner kept their credit. All three are closed: settlement now refuses to run on a pool that already has winners or has moved money, the winnings page is read-only, and the database blocks activation once a pool is no longer open."],
  ["No database could be provisioned from the repository at all", "The security-hardening migration ends with an assertion that fails the migration if an unexpected read policy survives — and a leftover policy from an earlier migration triggered it, aborting the migration and everything after it. Verified fixed by applying all 23 migrations to a scratch database."],
  ["Two RPCs existed only in the live database", "claim_pool_payout and get_public_winners were called in code but committed to no migration, so withdrawals and the winners ticker broke on a fresh environment. Added, guarded so they cannot overwrite the live definitions."],
  ["ESLint could not start, and would break the build", "A dependency conflict made the linter crash. Removed the dead dependency and pinned the transitive one."],
]));

c.push(H2("9.2 Security"));
c.push(table([2900, 5900], ["Issue", "Resolution"], [
  ["Open redirect after login", "The post-login target came from an unvalidated query parameter, allowing a phishing hop off a trusted domain. Now restricted to same-origin relative paths with an origin guard."],
  ["Filter injection in admin search", "Search text was interpolated into a PostgREST filter expression. Structural metacharacters are now stripped."],
  ["No rate limiting anywhere", "Credential stuffing and floods were unthrottled. Added a limiter backed by Upstash Redis (global across instances) with an in-memory fallback, applied to auth, newsletter, payout and checkout routes."],
  ["No CSRF defence on money mutations", "SameSite cookies were the only control. Added an explicit same-origin check on the money routes, and later extended it to every remaining privileged state-changing route."],
  ["A self-issued invitation still unlocked any private pool", "Self-joining was blocked, but the invitation table itself was not: a player could invite themselves into any private pool and accept it. Only the pool owner may now invite, and never themselves."],
  ["Rate limiting could be bypassed with a forged header", "The limiter keyed off the leftmost X-Forwarded-For entry, which the caller controls, so a random value per request gave each one its own bucket. It now prefers platform headers the edge overwrites, then the rightmost hop."],
  ["Reference data was writable by any signed-in account", "Team rows were insert/update-able by anyone, despite deciding every game's identity. Now admin-only, matching games."],
  ["A demoted admin kept database-level admin", "The role check trusted the token's claim over the users table, so revoking admin had no effect until the token expired. The table is now authoritative."],
  ["Sign-in returned the refresh token in the response body", "A long-lived credential was echoed into JSON when it already travels safely as an HTTP-only cookie. Removed."],
  ["Winner rows were directly readable by anonymous callers", "Exposed user identifiers and private-pool results. The public ticker now goes only through its minimal projection."],
  ["Chat could be used to exhaust a paid dependency and disable itself globally", "Every message triggers a moderation API call, unthrottled — and moderation fails closed, so tripping the provider's own rate limit would have blocked chat in every pool at once. Now rate limited and origin-checked."],
  ["A demoted admin kept API access until their token expired", "The admin check honoured the token's role claim, which cannot be revoked early. The database table is now the sole authority at the API layer too, matching the database's own check."],
]));

c.push(H2("9.3 Correctness"));
c.push(table([2900, 5900], ["Issue", "Resolution"], [
  ["Platform fee applied at settlement, not at sale", "Changing the global rate mid-pool re-split an in-flight pot against a rate nobody was charged. The fee is now locked on the pool at creation and settlement uses that."],
  ["Pools could be left permanently unsettled", "Score refresh only ever fetched ESPN's current week, so a game that finalised late was never updated again and its pool held player money indefinitely. Now fetches each pending week."],
  ["Winners' payout figures displayed as $0", "The financials RPC never returned the fee fields the display code read. Now derived from the pool's fee."],
  ["Tie-break rewarded players who skipped the tiebreaker", "A missing total-score prediction scored zero error — the best possible. Now treated as worst-case."],
  ["Successful payouts could report failure", "An audit-write failure after PayPal had already sent the money returned an error and left the request pending, inviting a re-debit. The completion is now recorded first."],
  ["Balance credit could be clobbered", "Settlement wrote an absolute balance computed before the write. Now an atomic relative credit, consistent with the other money paths."],
  ["Pools could not be created for a future week", "Game lookup fetched only the current week, so the insert failed and rolled the pool back."],
  ["No ordinary player could create a pool at all", "Pool creation writes reference data (teams and games), which the security hardening had correctly restricted to admins — so the write was denied and the whole pool was rolled back. That write is now performed with elevated rights after the caller is authenticated, using values that come from the sports feed rather than the request."],
  ["Every other player's name displayed as 'Unknown'", "Locking the users table to own-row reads — correct, since it holds email, role and balance — silently broke every display-name lookup in chat, participant lists and pool headers. These now read from the public name projection that was built for the purpose but never wired up."],
  ["Signing up reported failure after succeeding", "With email confirmation enabled there is no session yet, so the verification read after account creation came back empty and the request returned a server error — on a signup that had fully succeeded and already sent its confirmation email."],
  ["The newsletter table existed in no migration", "Subscribing would fail outright on a freshly provisioned database."],
  ["The tie-breaker rewarded predicting less", "Total-score error was summed only over the games a player actually predicted, so one lucky prediction beat full, more accurate coverage — making 'predict exactly one total' the dominant strategy. Missing predictions are now charged a worst-case penalty, with a regression test."],
  ["Invitations by email silently never worked", "Resolving an email to an account ran under the caller's own restricted view, which matches nobody else, so every email invite was dropped with 'no users found'."],
  ["Advertised prize differed from the amount actually paid", "The displayed net pot used the live platform fee while settlement used the pool's locked fee, so changing the rate mid-pool overstated the prize on a real-money product."],
  ["Documentation and tooling gaps", "The Docker environment template was silently excluded from the repository by a gitignore rule, and the document generators depended on a package that was never declared — so neither survived a fresh clone."],
]));

c.push(H2("9.4 Handover and maintainability"));
c.push(bullet("Added CI covering typecheck, settlement tests, build and lint — previously there was no quality gate at all."));
c.push(bullet([T("Added "), M("typecheck"), T(", "), M("test"), T(" and "), M("check"), T(" scripts.")]));
c.push(bullet("Reduced ESLint from 170 blocking errors to zero, by excluding Node scripts, auto-fixing safe rules, and demoting inherited debt to documented warnings."));
c.push(bullet("Standardised on a single package manager and removed the duplicate lockfile."));
c.push(bullet("Documented the self-hosted Docker path, including the pre-build requirement and its missing settlement scheduler."));
c.push(bullet("Rewrote the README, which referenced several files that do not exist and a directory layout that is not this repository's."));
c.push(bullet("Marked the stale schema snapshot and the unwired generated types with explicit warnings, and removed dead hooks and legacy routes."));

/* ─────────────── 10. CHECKLIST ─────────────── */
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(H1("10. Handover checklist"));
c.push(P("Work top to bottom. Everything in §10.1 must be true before the platform takes real money."));

c.push(H2("10.1 What the client must do — the entire technical handover"));
c.push(P("Nothing in this subsection needs an engineer beyond whoever administers the server. It is credentials and one verification URL."));
c.push(P("Two deployment shapes are supported and the steps differ slightly. Where an item says HOST, read it as the Vercel project's environment variables, or as the .env.docker file on a self-hosted VPS. The self-hosted path is the one currently being provisioned."));
c.push(checklist([
  ["Set the production credentials on the HOST", "SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, PAYPAL_MODE=live plus PayPal client id/secret, CRON_SECRET, and the two Upstash variables. docs/RUNBOOK.md section 3 is the table: where each value comes from and what breaks without it"],
  ["Self-hosted only: set TRUSTED_PROXY=cloudflare", "Load-bearing, and it fails silently. The stack sits behind a Cloudflare tunnel, and this is what tells the app to trust that edge for the visitor's location. Without it every location is unverifiable, so the compliance gate refuses every purchase while the site otherwise looks healthy. Do not set it if the server is ever reachable directly, bypassing the tunnel"],
  ["RESTART or REDEPLOY after setting them", "Environment variables are read at start-up, not live. On Vercel: Deployments, latest, Redeploy, because variables are snapshotted into a build. Self-hosted: docker compose up -d to recreate the containers. This step is missed constantly and it is the single most likely reason a correctly-set key appears not to work"],
  ["Confirm both scheduled jobs are running", "Settlement pays pools out and reconciliation catches payment-to-ledger divergence. On Vercel these are the two vercel.json crons plus the GitHub Actions workflows, and CRON_SECRET must be mirrored into GitHub Actions secrets or settle-pools.yml and alert.yml SKIP while still reporting success - a green workflow doing nothing. Self-hosted: the settle-cron and reconcile-cron compose services carry both, and only the error-digest workflow still needs the Actions secret. Verify with docker compose logs settle-cron, or by running a workflow manually and confirming its trigger step says success, not skipped"],
  ["Register the Stripe webhook", "Endpoint /api/stripe/webhook subscribed to checkout.session.completed, then put its signing secret in STRIPE_WEBHOOK_SECRET. Unset is verifiable from outside: the endpoint answers 503 Webhook not configured instead of 400 Missing stripe-signature"],
  ["Check one URL until it says ok", "curl -H \"Authorization: Bearer $CRON_SECRET\" https://<domain>/api/health returns a component-by-component breakdown naming every unset variable and what it costs. This is the readiness test and it needs no engineer to interpret"],
  ["Run the money path once in Stripe test mode", "Purchase, webhook, card issued, picks, settlement, balance credit, PayPal payout - including a deliberately duplicated webhook delivery to prove idempotency under real conditions rather than by inspection. This is the one item that genuinely cannot be closed without live processor credentials"],
]));

c.push(note("How to read the health endpoint",
  [T("Anonymous callers get a status word and nothing else - a public health endpoint is a reconnaissance surface during an outage. With CRON_SECRET you get the full breakdown."),
   T("Severity is deliberately split. Missing money-path credentials report DEGRADED at HTTP 200, not 503, because the site genuinely serves without them and a probe that screams through the entire provisioning period is one nobody reads on the day it matters. 503 is reserved for core configuration failure or a genuinely unreachable database. status ok means fully provisioned.")],
  "EAF2EA", GREEN));

c.push(H2("10.2 Not code, and not the client's engineer either"));
c.push(P("These gate launch, but no amount of engineering closes them:"));
c.push(checklist([
  ["Obtain a legal opinion on operating jurisdictions, then set jurisdiction_rules", "Paid-entry contests with cash prizes on sporting outcomes are regulated differently in every US state and most other countries. The enforcement is built and tested; the rows ship as a conservative placeholder explicitly marked as such in the database. Applying counsel's answer is a data UPDATE, not a deploy"],
  ["Get written confirmation from Stripe and PayPal that they permit this use case", "Both restrict gambling and contest-adjacent businesses and require prior approval. Operating outside the agreed category risks abrupt account termination while holding player funds"],
  ["Have counsel review the Terms, Privacy Policy and Contest Rules", "The Contest Rules now describe the implementation accurately, which makes the review far cheaper than it would have been. Accurate is not the same as compliant, and only counsel can say which"],
  ["Enable PITR and rehearse one restore", "A dashboard toggle plus an hour. A daily snapshot alone can lose up to 24 hours of money movements. Procedure including the post-restore reconciliation step is in docs/RUNBOOK.md section 2"],
]));

c.push(H2("10.3 Engineering work that remains"));
c.push(P("Stated honestly rather than quietly dropped. None of it blocks launch; all of it would reduce risk."));
c.push(table([2700, 6100], ["Item", "Assessment"], [
  ["Browser-level journey tests", "HIGH. The HTTP smoke suite covers the anonymous attack surface, but signup, purchase, picks and withdrawal are not driven through a real browser."],
  ["Per-route test coverage", "MEDIUM. The shared guard layer is pinned by 34 unit tests, which is the highest-leverage seam. Per-route auth and ownership tests would catch wiring mistakes the guard tests structurally cannot."],
  ["Manual screen-reader pass", "MEDIUM. 21 jsx-a11y rules block CI at error severity and 23 defects were fixed, but an automated floor is not a usability verdict. One session with VoiceOver or NVDA across signup, purchase and picks closes it."],
  ["One interactive sign-in", "MEDIUM. The @supabase/ssr 0.5 to 0.12 upgrade changed session cookie handling. Anonymous rejection is verified against production; a successful login is not."],
  ["Staging environment", "MEDIUM. Money-path changes should be exercised somewhere real before they reach users."],
  ["Recover static generation", "LOW. force-dynamic is global for the CSP nonce, an accepted trade. If marketing SEO becomes a priority, serve public pages a nonce-free CSP and scope force-dynamic to authenticated routes."],
]));

c.push(H2("10.4 Verified on 13 August, so you need not re-check"));
c.push(P("Each of these was confirmed against the live system rather than inferred from the repository:"));
c.push(bullet([T("Production deploys again, and the config class that silently stopped deployments is blocked in CI.")]));
c.push(bullet([T("13 of 13 end-to-end assertions pass against production: CSP and nonce, clickjacking and sniffing headers, the health contract, anonymous rejection on four money routes, CSRF refusal, both 410 tombstones, and 404 on unknown API paths across five methods.")]));
c.push(bullet([T("Self-exclusion cannot be shortened - an explicit attempt to cut a 365-day exclusion left it unchanged in the live database.")]));
c.push(bullet([T("No client write path exists to the money tables; the migration ledger, RLS policies and RPC grants were queried directly.")]));
c.push(bullet([T("Admin MFA is enforced on payout completion, role changes and platform-fee edits, and the TOTP enrolment screen exists so no admin can be locked out of enrolling.")]));
c.push(bullet([T("The bootstrap endpoint self-disables: it answers 410 once any admin exists, so a forgotten SETUP_SECRET is no longer a hole.")]));


/* ─────────────── 11. Debt ─────────────── */
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(H1("11. Known technical debt"));
c.push(P("Recorded deliberately, with the reasoning, so the next team inherits the judgement and not just the code."));
c.push(table([2700, 6100], ["Item", "Why it was left"], [
  ["~150 `any` annotations", "Mostly the untyped ESPN payload and shared domain models. Rewriting them at handover is a regression risk with no functional gain; kept visible as warnings."],
  ["Seven set-state-in-effect findings", "A UI-behaviour refactor across five pages. Each needs to be exercised in a browser to confirm pagination and filtering still behave; doing it blind trades a real regression for a performance nit."],
  ["Duplicate migration timestamp", "Two files share a prefix. They are already applied, and renaming an applied migration breaks Supabase's history — so they are left alone. Use distinct timestamps for new migrations."],
  ["schema.sql", "Retained for historical reference, clearly marked as not authoritative."],
  ["Legacy picks table", "Superseded by card_picks. Its write route is already 410; the table can be dropped once nothing reads it."],
  ["Unwired generated types", "Regenerating requires a live database connection, which was not available during the audit."],
]));

/* ─────────────── 12. Runbook ─────────────── */
c.push(H1("12. Operations runbook"));
c.push(H2("12.1 Everyday commands"));
c.push(...code([
  "npm ci                 install exactly what the lockfile pins",
  "npm run dev            development server",
  "npm run check          typecheck + settlement tests + lint  (run before pushing)",
  "npm run build          production build",
  "npm run db:migrate     apply migrations",
  "npm run seed:admin     promote the configured admin account",
]));
c.push(H2("12.2 Incident: a pool completed but nobody was paid"));
c.push(numbered("Check the settlement logs for a warning naming that pool. A completed pool with no winners is reported explicitly, because it means player money is being held."));
c.push(numbered("Confirm every game in the pool has a finished status and both scores. Settlement deliberately refuses to score an incomplete slate."));
c.push(numbered("Confirm the prize pot is non-zero. Settlement refuses to pay a zero pot when paid cards exist rather than silently paying nothing."));
c.push(numbered("Once the underlying data is corrected, the next scheduled run settles it — the job is idempotent and safe to re-run."));
c.push(H2("12.3 Incident: a player was charged but has no card"));
c.push(numbered("Search the logs for FULFILMENT FAILED, which the webhook logs with the Stripe session id."));
c.push(numbered("The usual causes are a pool that closed between payment and fulfilment, or the player already holding three cards. Both need an operator refund in Stripe."));
c.push(numbered("If this happens on every purchase, the fee trigger or column defaults are missing — verify migration 20260807000001 is applied."));
c.push(H2("12.4 Incident: settlement is not running"));
c.push(numbered("A 503 from /api/cron/settle means CRON_SECRET is unset on the host — the endpoint fails closed by design."));
c.push(numbered("A 401 means the scheduler's secret does not match the host's."));
c.push(numbered("On Vercel: if the GitHub Actions run skipped with a warning, its CRON_SECRET secret is missing; the daily vercel.json cron still covers settlement in the meantime."));
c.push(numbered("Self-hosted: check the scheduler container with docker compose logs settle-cron, which prints one line per invocation with its HTTP status. If docker compose ps does not list the service at all, nothing is calling settlement and pools are holding player money — bring the full stack up rather than the app alone."));

/* ─────────────── 13. Quick reference ─────────────── */
c.push(H1("13. Quick reference"));
c.push(H2("13.1 Endpoints by auth posture"));
c.push(table([3300, 5500], ["Posture", "Endpoints"], [
  ["Public", "GET /api/pools, /api/pools/[id], /api/games, /api/games/[id], /api/winners; POST /api/newsletter/subscribe"],
  ["Authenticated", "/api/auth/*, /api/me/* , POST /api/pools, /api/pools/[id]/cards*, /api/pools/[id]/chat, /api/invitations/*, /api/stripe/create-checkout-session, /api/stripe/confirm-payment"],
  ["Admin only", "/api/admin/*, /api/games/[id]/outcome, /api/sync/nfl-games, /api/pools/complete-finished"],
  ["Secret-gated", "/api/cron/settle (CRON_SECRET), /api/seed-admin (SETUP_SECRET)"],
  ["Signature-gated", "/api/stripe/webhook — the Stripe signature is its authentication"],
  ["Removed (410 Gone)", "/api/pools/[id]/cards/purchase, /api/pools/[id]/cards/[cardId]/submit"],
]));
c.push(H2("13.2 Environment variables that have no safe default"));
c.push(table([3300, 5500], ["Variable", "Consequence if wrong or missing"], [
  ["SUPABASE_SERVICE_ROLE_KEY", "Bypasses all RLS. Never expose to the browser."],
  ["STRIPE_WEBHOOK_SECRET", "Webhook fails closed — players are charged and receive no card."],
  ["CRON_SECRET", "Settlement returns 503 and never runs; winners are never paid."],
  ["SETUP_SECRET", "Admin bootstrap disabled. Unset it again once the admin exists."],
  ["PAYPAL_MODE", "Sandbox in production is refused by an explicit guard."],
  ["NEXT_PUBLIC_APP_URL", "Stripe redirects and auth emails point at the wrong host."],
]));

c.push(new Paragraph({ spacing: { before: 320 },
  border: { top: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 8 } },
  children: [new TextRun({ text: "Prepared as part of the final pre-handover audit. Companion documents: the backend security audit report, the technical architecture reference, and the plain-English overview.", italics: true, size: 17, color: GREY })] }));

/* ─────────────── Document ─────────────── */
// Exported so scripts/gen-combined-doc.cjs can assemble every document into one
// deliverable without duplicating a single line of this content. Running this file
// directly still writes its own .docx exactly as before.
if (require.main !== module) { module.exports = c; return; }

const doc = new Document({
  creator: "Gridiron Engineering",
  title: "Gridiron — Project Handover Document",
  description: "Project explanation, architecture, security model, operations runbook and handover checklist",
  numbering: {
    config: [
      { reference: "b", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 440, hanging: 250 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 880, hanging: 250 } } } },
      ]},
      { reference: "n", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 300 } } } },
      ]},
    ],
  },
  styles: {
    default: { document: { run: { font: "Calibri", size: 21, color: "222222" } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Calibri", size: 32, bold: true, color: NAVY },
        paragraph: { spacing: { before: 320, after: 150 }, keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Calibri", size: 25, bold: true, color: BLUE },
        paragraph: { spacing: { before: 240, after: 100 }, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Calibri", size: 21, bold: true, color: "3A3A3A" },
        paragraph: { spacing: { before: 170, after: 65 }, keepNext: true } },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, bottom: 1150, left: 1300, right: 1300 } } },
    children: c,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(process.argv[2] || "Gridiron_Project_Handover.docx", buf);
  console.log("WROTE", buf.length, "bytes");
});
