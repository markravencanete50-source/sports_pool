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
  ["Date", "8 August 2026"],
  ["Repository", "markravencanete50-source/sports_pool"],
  ["Product", "Real-money NFL prediction pools (parlay cards, prize pots, payouts)"],
  ["Stack", "Next.js 16 · TypeScript · Supabase (Postgres + RLS) · Stripe · PayPal · Vercel"],
  ["Scale", "43 API routes · 22 migrations · 62 components · ~18,700 lines TS/TSX"],
  ["Status", { text: "Handover-ready — all quality gates green", bold: true }],
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
  ["TypeScript (tsc --noEmit)", { text: "PASS", color: GREEN, bold: true }, "0 errors"],
  ["Settlement regression tests", { text: "PASS", color: GREEN, bold: true }, "Scoring, tie-breaks, 243 rounding combinations"],
  ["Production build (next build)", { text: "PASS", color: GREEN, bold: true }, "47 routes compile"],
  ["ESLint", { text: "PASS", color: GREEN, bold: true }, "0 errors (inherited style debt tracked as warnings)"],
  ["Continuous integration", { text: "ADDED", color: GREEN, bold: true }, "All four gates now block every push and PR"],
]));
c.push(new Paragraph({ spacing: { after: 80 } }));
c.push(note("The two most important findings",
  [T("1. Card purchases were broken end-to-end on any database provisioned from the committed migrations. ", { bold: true }),
   T("Two columns on "), M("pool_transactions"), T(" are "), M("NOT NULL"), T(" with no default, the trigger meant to populate them existed in no migration, and the purchase code supplied neither — so the insert failed, the card was rolled back, and the player was charged by Stripe and received nothing."),
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
  ["Vercel Cron + GitHub Actions", "Scheduled settlement (daily and every 30 minutes respectively)."],
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
  "supabase/migrations/        22 files — the source of truth for the database",
  "scripts/                    seeds + the settlement regression suite",
  ".github/workflows/          ci.yml (quality gates) + settle-pools.yml (cron)",
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
]));

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
c.push(P("Continuous integration runs on every push and pull request and blocks the merge on all four gates:"));
c.push(table([2400, 6400], ["Gate", "Why it blocks"], [
  ["npm run typecheck", "Catches real breakage — wrong shapes, dead symbols, bad refactors."],
  ["npm test", "The money path: scoring, tie-breaks and the cent-exact split. A failure here is a release blocker."],
  ["npm run build", "Last defence against a failure that would only appear at deploy time."],
  ["npm run lint", "Pre-existing style debt is configured as warnings, so this blocks only on genuinely new errors."],
]));
c.push(runs([T("Run all four locally with "), M("npm run check"), T(" before pushing.")]));

/* ─────────────── 9. What the audit changed ─────────────── */
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(H1("9. What the audit changed"));
c.push(P("A staged audit — security, then correctness, then handover readiness — was run across the backend, frontend, database and build. Findings were adversarially verified before any change was made. The material fixes:"));

c.push(H2("9.1 Critical"));
c.push(table([2900, 5900], ["Issue", "Resolution"], [
  ["Card purchases failed on any rebuilt database, charging the player and issuing nothing", "platform_fee / net_amount were NOT NULL with no default and no trigger supplied them. Migration 20260807000001 adds the defaults and creates the trigger, which also finally records the platform's cut per sale."],
  ["A crafted pool could mint prize money", "The pool's fee percentage is multiplied into the payout, and the column was writable on insert and never clamped, so a negative value paid out more than the pot. The fee is now stamped unconditionally by trigger, constrained to 0–100 by the database, and clamped again in code before use."],
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

c.push(H2("10.1 Before going live — blocking"));
c.push(H3("Database"));
c.push(checklist([
  ["Apply every migration to the production database (npm run db:migrate) and confirm 22 migrations report as applied", "Never use schema.sql"],
  ["Verify the reconstructed RPCs match production: claim_pool_payout and get_public_winners", "See §10.4"],
  ["Confirm a test card purchase writes a pool_transactions row with a non-zero platform_fee", "Proves the trigger is live"],
  ["Confirm pools.platform_fee_percentage is populated for every existing pool, and is between 0 and 100", "Backfilled and constrained"],
  ["Attempt to create a pool with a negative fee via the REST API and confirm it is stamped, not accepted", "Payout-inflation guard"],
  ["Confirm supabase db push applies cleanly on a scratch database, with no duplicate-version error", "A duplicate version was resolved"],
  ["Take a verified backup and confirm the restore procedure works", ""],
]));
c.push(H3("Regression checks — these were broken and are now fixed"));
c.push(checklist([
  ["Create a pool as an ordinary (non-admin) account and confirm it succeeds", "Was failing for every non-admin"],
  ["Open a pool chat with two accounts and confirm both names render, not 'Unknown'", "Display-name projection"],
  ["Sign up with email confirmation enabled and confirm the response is a success, not a 500", ""],
  ["Confirm a player cannot invite themselves into someone else's private pool", "Invite bypass"],
  ["Buy a card and confirm exactly one pool_transactions row appears with a correct platform_fee", ""],
]));
c.push(H3("Secrets and configuration"));
c.push(checklist([
  ["Set every variable in .env.example on the production environment", ""],
  ["Confirm SUPABASE_SERVICE_ROLE_KEY is server-side only and never prefixed NEXT_PUBLIC_", "Bypasses all RLS"],
  ["Set STRIPE_WEBHOOK_SECRET and register the webhook for checkout.session.completed", "Without it players are charged and get nothing"],
  ["Set CRON_SECRET on both Vercel and GitHub Actions, with identical values", "Unset means settlement never runs"],
  ["Run the one-time admin bootstrap, then unset SETUP_SECRET", ""],
  ["Set PAYPAL_MODE to live and confirm the sandbox guard passes", ""],
  ["Set UPSTASH_REDIS_REST_URL and _TOKEN so rate limits apply across instances", "Otherwise per-instance only"],
  ["Rotate any credential that was ever shared during development", ""],
]));
c.push(H3("Payments"));
c.push(checklist([
  ["End-to-end test: buy a card with a real card and confirm exactly one card is issued", ""],
  ["Test the closed-tab case: complete payment, close the tab, confirm the webhook still issues the card", ""],
  ["Confirm a duplicate webhook delivery does not create a second card", ""],
  ["End-to-end test: request and approve a withdrawal, and confirm the PayPal payout arrives", ""],
  ["Confirm a failed PayPal payout returns the reserved funds to the balance", ""],
]));
c.push(H3("Settlement"));
c.push(checklist([
  ["Run a full pool through settlement on staging and reconcile every payout to the cent", ""],
  ["Confirm the scheduled job runs and authenticates (check the Actions run and Vercel logs)", ""],
  ["Confirm a pool with a game finishing after the ESPN week rolls over still settles", "The fix in §9.3"],
  ["Agree who monitors settlement warnings, and where they are surfaced", "Held funds are logged as warnings"],
]));
c.push(H3("Security"));
c.push(checklist([
  ["Confirm RLS is enabled on every table and the hardening migration applied without raising", ""],
  ["Verify with a second account that you cannot read another player's cards or picks", ""],
  ["Confirm the anonymous key cannot read the users table", ""],
  ["Confirm admin routes reject a non-admin session", ""],
  ["Review who holds admin, and remove anyone who should not", ""],
]));

c.push(H2("10.2 Operational readiness"));
c.push(checklist([
  ["Transfer ownership of the Vercel project, Supabase project, Stripe and PayPal accounts", ""],
  ["Transfer the GitHub repository and configure branch protection on main to require CI", ""],
  ["Confirm CI passes on main after transfer", ""],
  ["Set up error monitoring and alerting on the money paths", "Grep the logs for CRITICAL"],
  ["Document who is on call for a failed settlement or payout", ""],
  ["Confirm the daily Vercel cron and the 30-minute Actions cadence are both active", ""],
]));

c.push(H2("10.3 Legal and compliance"));
c.push(note("Outside the scope of this engineering handover",
  [T("This platform takes entry fees and pays cash prizes. Real-money contest regulation varies by jurisdiction and can require licensing, age and location verification, KYC/AML checks, tax reporting and specific terms. "),
   T("None of that was assessed here and none of it is implemented.", { bold: true }), T(" Obtain qualified legal advice for every market you intend to operate in before accepting real money.")],
  "FBECEC", RED));
c.push(checklist([
  ["Obtain legal advice on real-money contest regulation in each target market", "Not assessed"],
  ["Decide on age and location verification requirements", "Not implemented"],
  ["Decide on KYC/AML obligations for payouts", "Not implemented"],
  ["Have the terms, privacy policy and responsible-play content reviewed", "Placeholder pages exist"],
  ["Confirm tax reporting obligations for winnings", ""],
]));

c.push(H2("10.4 Recommended follow-up work"));
c.push(P("None of these block handover, but each is worth scheduling."));
c.push(checklist([
  ["Dump the live claim_pool_payout and get_public_winners and replace the reconstructed definitions", "Makes the committed version authoritative"],
  ["Regenerate src/lib/supabase/types.ts and wire the Database generic into the clients", "Currently stale and unused"],
  ["Add a unique constraint on user_transactions(reference_type, reference_id)", "Enforces payout single-processing in the database"],
  ["Fix the seven set-state-in-effect findings and re-enable the rule as an error", "Needs browser verification"],
  ["Type the ESPN payload and shared models, then restore no-explicit-any to error", "~150 instances"],
  ["Add a settlement scheduler to the Docker compose stack", "Self-host has none"],
  ["Drop the legacy picks table once nothing reads it", "Its write route is already 410"],
  ["Add end-to-end tests for purchase and withdrawal", "Only settlement is covered today"],
]));

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
c.push(numbered("If the GitHub Actions run skipped with a warning, its CRON_SECRET secret is missing; the daily Vercel cron is still covering settlement in the meantime."));

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
  fs.writeFileSync("/home/user/sports_pool/Gridiron_Project_Handover.docx", buf);
  console.log("WROTE", buf.length, "bytes");
});
