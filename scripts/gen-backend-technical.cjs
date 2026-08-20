const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  PageBreak, TableOfContents, LevelFormat,
} = require("docx");
const fs = require("fs");

const NAVY = "1F3864";
const BLUE = "2E4A7A";
const GREEN = "1E7A3E";
const AMBER = "B8860B";
const GREY = "595959";
const MONO = "Consolas";

const H1 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 140 } });
const H2 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 90 } });
const H3 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 70 } });

function P(text, o = {}) {
  return new Paragraph({ spacing: { after: o.after ?? 120, line: 276 },
    children: [new TextRun({ text, size: 21, color: o.color, bold: o.bold, italics: o.italics })] });
}
function runs(kids, o = {}) { return new Paragraph({ spacing: { after: o.after ?? 120, line: 276 }, children: kids }); }
function T(t, o = {}) { return new TextRun({ text: t, size: o.size ?? 21, bold: o.bold, italics: o.italics, color: o.color, font: o.font }); }
function M(t) { return new TextRun({ text: t, font: MONO, size: 18, color: "1A4D2E" }); } // inline mono, greenish
function bullet(text, level = 0) {
  return new Paragraph({ numbering: { reference: "b", level }, spacing: { after: 80, line: 268 },
    children: Array.isArray(text) ? text : [new TextRun({ text, size: 21 })] });
}
function code(lines) {
  const arr = Array.isArray(lines) ? lines : [lines];
  return arr.map((ln, i) => new Paragraph({
    spacing: { after: i === arr.length - 1 ? 130 : 0, line: 238 },
    shading: { type: ShadingType.CLEAR, fill: "F6F8FA" },
    border: { left: { style: BorderStyle.SINGLE, size: 14, color: "C4CDD5", space: 8 } },
    children: [new TextRun({ text: ln.length ? ln : " ", font: MONO, size: 17, color: "24292E" })],
  }));
}
const cB = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" }, right: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
};
function cell(content, { width, fill, header, mono } = {}) {
  const arr = Array.isArray(content) ? content : [content];
  const kids = arr.map((c) => typeof c === "string"
    ? new Paragraph({ spacing: { after: 0, line: 258 }, children: [new TextRun({ text: c, size: header ? 18 : 18, bold: header, color: header ? "FFFFFF" : undefined, font: mono ? MONO : undefined })] })
    : c);
  return new TableCell({ width: { size: width, type: WidthType.DXA }, shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 }, borders: cB, children: kids });
}
function table(colW, headers, rows, opts = {}) {
  const total = colW.reduce((a, b) => a + b, 0);
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: colW,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { width: colW[i], fill: NAVY, header: true })) }),
      ...rows.map((r, ri) => new TableRow({ children: r.map((c, i) => cell(c, { width: colW[i], fill: ri % 2 ? "F4F6FA" : undefined, mono: opts.monoCols && opts.monoCols.includes(i) })) })),
    ] });
}
function note(title, body, fill = "FBF3E6", bar = AMBER) {
  return new Table({ width: { size: 8900, type: WidthType.DXA }, columnWidths: [8900],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: 8900, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill },
      margins: { top: 110, bottom: 110, left: 150, right: 150 },
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 18, color: bar } },
      children: [ new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: title, bold: true, size: 20, color: NAVY })] }),
        new Paragraph({ spacing: { after: 0, line: 272 }, children: Array.isArray(body) ? body : [new TextRun({ text: body, size: 20 })] }) ],
    })]})] });
}

const c = [];

// Cover
c.push(
  new Paragraph({ spacing: { before: 1500, after: 0 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Backend Architecture & Security", bold: true, size: 52, color: NAVY })] }),
  new Paragraph({ spacing: { before: 120, after: 0 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Technical Reference", size: 30, color: GREY })] }),
  new Paragraph({ spacing: { before: 60, after: 500 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Gridiron — Sports Pool Platform", size: 24, italics: true, color: GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 10 } }, spacing: { before: 200, after: 300 }, children: [new TextRun({ text: "", size: 2 })] }),
);
const meta = [
  ["Stack", "Next.js 16 (App Router, route handlers) · TypeScript · Supabase (Postgres + RLS + Auth) · Stripe · PayPal Payouts · ESPN feed · scheduled jobs (Vercel Cron, or compose services when self-hosted)"],
  ["Runtime model", "Server-side route handlers under src/app/api; two Supabase clients (session/anon vs service-role); DB is the authorization boundary"],
  ["Audience", "Engineers, reviewers, security"],
  ["Companion docs", "Backend_Security_Audit_Report.docx · Backend_Explained_Simply.docx"],
];
c.push(table([2200, 6600], ["Field", "Detail"], meta));
c.push(new Paragraph({ children: [new PageBreak()] }));

// TOC
c.push(H1("Contents"));
c.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));
c.push(new Paragraph({ children: [new PageBreak()] }));

// 1 Architecture
c.push(H1("1. Architecture overview"));
c.push(P("The backend is a set of Next.js App Router route handlers (src/app/api/**/route.ts) executing server-side. There is no separate API server; each handler is a serverless function. State lives in Supabase Postgres; authentication is Supabase Auth (JWT in HTTP-only cookies). External integrations are Stripe (card acquiring), PayPal Payouts (withdrawals), and the ESPN scoreboard feed (scores). Settlement and reconciliation are driven by whatever calls their endpoints on a schedule: Vercel Cron on Vercel, or the settle-cron and reconcile-cron services when self-hosted. The route handlers are identical either way; only the caller differs."));
c.push(H2("1.1 The two Supabase clients"));
c.push(P("Every data access uses one of two clients, and choosing correctly is the backbone of the access-control model:"));
c.push(table([2600, 6200],
  ["Client", "Semantics"],
  [
    ["createClient() — src/lib/supabase/server.ts", "Anon/session client built from the request cookies. Runs as the authenticated user (or anon). RLS applies. Default for all user-facing reads/writes."],
    ["createAdminClient() — src/lib/supabase/admin.ts", "Service-role client. Bypasses RLS entirely. Used only where there is no user session (Stripe webhook, cron) or after an explicit authorization gate. persistSession:false."],
  ]));
c.push(note("Core invariant",
  [T("The database is the authorization boundary, not the API. ", { bold: true }), T("Every service-role write is derived from a trusted source (Stripe session, ESPN feed) or sits behind an explicit gate (requireAdmin / requireSecret). Every user-facing path runs under RLS so an API bug alone cannot leak or move money.")],
  "EAF2EA", GREEN));

c.push(H2("1.2 Request lifecycle (authenticated route)"));
c.push(...code([
  "1. Route handler invoked (POST/GET/PATCH/PUT/DELETE)",
  "2. supabase = await createClient()            // cookie-bound session client",
  "3. const { data:{user} } = await supabase.auth.getUser()   // verify JWT",
  "4. if (!user) -> 401",
  "5. authorize: ownership check and/or requireAdmin(supabase)",
  "6. validate: zod schema .parse()/.safeParse() on the body/params",
  "7. execute: query under RLS (session client) OR service-role after gate",
  "8. RLS re-checks the same rule at the DB layer (defence in depth)",
]));

// 2 Data model
c.push(H1("2. Data model (security-relevant tables)"));
c.push(table([2500, 6300],
  ["Table", "Role & sensitivity"],
  [
    ["users", "Profile + role + balance. Own-row read only; role/balance immutable by clients."],
    ["pools / pool_games / pool_participants", "Pool definition, its game slate, and membership. Participation gates private-pool access."],
    ["parlay_cards / card_picks", "A user's paid entry and their predictions. Highest privacy requirement — holder-only."],
    ["picks (legacy)", "Older per-pool predictions. Not used by settlement; owner-read only."],
    ["pool_transactions", "Entry payments (feeds prize pot). Service-role write only; UNIQUE(stripe_session_id)."],
    ["payout_approvals / pool_winners", "Materialized winnings and claim state."],
    ["payout_requests", "Withdrawal requests. Owner-insert (bounded by balance in RLS); service-role status transitions."],
    ["user_transactions", "Immutable ledger of balance movements; UNIQUE winning-per-pool index prevents double credit."],
    ["comments", "Pool chat. Readable/postable by card holders/participants only."],
    ["games / teams", "Reference + live scores. Admin-only writes; scores drive settlement."],
    ["platform_settings", "Fee %, minimum entry fee. Source of authoritative pricing."],
  ]));

// 3 Security layers
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(H1("3. Security layers"));
c.push(P("Seven layers, defence-in-depth. Each is independently sufficient to stop its class of attack; together they mean a single-layer failure is not exploitable."));

c.push(H2("Layer 1 — Authentication"));
c.push(bullet([T("Supabase Auth issues a JWT stored in HTTP-only cookies; "), M("supabase.auth.getUser()"), T(" verifies it server-side on every protected handler.")]));
c.push(bullet([T("Password policy (zod, "), M("signupSchema"), T("): ≥10 chars with lower/upper/digit classes. Documented gap: leaked-password (HIBP) check is a Supabase Pro feature; enable dashboard password rules to match on all paths.")]));
c.push(bullet([T("Identity for privileged DB functions comes from "), M("auth.uid()"), T(" / "), M("auth.jwt()"), T(", never from a client-supplied id.")]));

c.push(H2("Layer 2 — Authorization (object- and role-level)"));
c.push(bullet([T("Role gate: "), M("requireAdmin(supabase)"), T(" (src/lib/require-admin.ts) — 401 if unauthenticated, 403 unless "), M("app_metadata.role === 'admin'"), T(" or "), M("users.role === 'admin'"), T(".")]));
c.push(bullet([T("Object-level (IDOR prevention): resources are bound to the caller in the query, e.g. cards are fetched "), M(".eq('id',cardId).eq('user_id',user.id).eq('pool_id',poolId)"), T("; a foreign id returns 404, not another user's row.")]));
c.push(bullet("Ownership ≠ authority over settlement: pool lifecycle/status changes require admin, not merely pool creator (admin/pools/[poolId]/settings)."));
c.push(note("IDOR hardening example",
  [T("GET /api/pools/[poolId]/cards/[cardId]/picks previously queried by cardId alone. Now it resolves the card bound to (caller, pool) first and 404s otherwise — API-level enforcement layered on top of holder-only RLS.")],
  "EAF2FB", BLUE));

c.push(H2("Layer 3 — Row Level Security (the DB authorization boundary)"));
c.push(P("The RLS migration (supabase/migrations/20260804000000_security_hardening_rls.sql) is the strongest layer. Key policies:"));
c.push(table([2500, 6300],
  ["Object", "Policy (summary)"],
  [
    ["games", "INSERT/UPDATE only where public.is_admin(); non-negative score CHECK. (Replaced a shipped “any authenticated user can update” policy.)"],
    ["users", "SELECT own row or admin; UPDATE own row with role & balance pinned to current values (no self-promotion, no self-credit). public_profiles view exposes id/name/avatar only."],
    ["parlay_cards / card_picks", "Holder-only SELECT. Picks INSERT/UPDATE only while card is pending AND game.date > now() AND status='scheduled' (kickoff lock mirrored in DB)."],
    ["pool_transactions", "SELECT own or admin; NO client INSERT/UPDATE (service-role only); UNIQUE(stripe_session_id)."],
    ["payout_requests", "SELECT own or admin; INSERT own where amount>0, status='pending', amount <= caller balance; status transitions service-role only."],
    ["pool_participants", "INSERT only for public pools or an accepted invitation (blocks self-join into private pools)."],
    ["comments", "SELECT/INSERT only for card holders/participants/admin; post as self only."],
    ["picks (legacy)", "SELECT own only."],
  ]));
c.push(note("Permissive-OR pitfall + invariant assertion",
  [T("Postgres RLS policies are PERMISSIVE and OR-ed, so one loose SELECT policy defeats every strict one beside it. The migration drops known-bad policies by name AND ends with a "), M("DO $$"), T(" block that raises and rolls back if any unexpected SELECT policy exists on privacy-critical tables — so a silent "), M("drop policy if exists"), T(" no-op cannot leave a hole open.")],
  "FBECEC", "B22222"));

c.push(H2("Layer 4 — Money integrity"));
c.push(bullet([T("Server-authoritative pricing: checkout charges "), M("pool.entry_fee"), T(" (validated against platform minimum), never the client's "), M("entryFee"), T("; a mismatch is a 409.")]));
c.push(bullet([T("Stripe webhook is the source of truth: raw-body signature verification ("), M("constructEvent"), T(") against "), M("STRIPE_WEBHOOK_SECRET"), T("; session re-retrieved from Stripe; amount cross-checked vs "), M("session.amount_total"), T(".")]));
c.push(bullet([T("Two-layer idempotency (fulfillCardPurchase): pre-insert lookup on "), M("stripe_session_id"), T(" + UNIQUE constraint whose 23505 violation is treated as success — webhook/return-page race cannot double-issue a card.")]));
c.push(bullet([T("Atomic balance mutation: "), M("debit_user_balance"), T(" is a single conditional "), M("UPDATE ... WHERE balance >= amount"), T(" (returns NULL on insufficient funds); "), M("credit_user_balance"), T(" adds relatively. Both SECURITY DEFINER, revoked from anon/authenticated.")]));
c.push(bullet([T("Payout ordering: reserve (atomic debit) → send (PayPal) → compensate (credit back on failure); "), M("assertPayoutModeSafe()"), T(" refuses sandbox-vs-prod mismatch; idempotent on "), M("reference_id"), T(".")]));
c.push(bullet([T("Claim path: "), M("claim_pool_payout()"), T(" runs the whole claim in one DB transaction with "), M("SELECT ... FOR UPDATE"), T("; balance moves relatively, not by absolute write (avoids lost updates).")]));
c.push(bullet("Monetary precision: pot split in integer cents with deterministic remainder distribution (winners.ts), so payouts sum exactly to the net pot."));

c.push(H2("Layer 5 — Game integrity & privacy"));
c.push(bullet("Per-game kickoff lock in the API (picks accepted only while game.status='scheduled' and kickoff in the future) and mirrored in RLS."));
c.push(bullet("Card & pick privacy: holder-only at both API and RLS; opponents cannot read picks before or after kickoff."));
c.push(bullet("Scores are admin-write only and are pulled from ESPN by trusted server code; a finished status is never written without both scores."));

c.push(H2("Layer 6 — Secrets & automation"));
c.push(bullet([T("requireSecret() (src/lib/require-secret.ts): "), M("fail-closed"), T(" (503 if the env secret is unset), timing-safe comparison ("), M("timingSafeEqual"), T("), accepts Bearer or x-cron-secret.")]));
c.push(bullet("Gated endpoints: /api/cron/settle (CRON_SECRET) and /api/seed-admin (SETUP_SECRET, one-time bootstrap that cannot require an admin session because none exists yet)."));
c.push(bullet("Webhook auth IS the Stripe signature; the route is deliberately outside session middleware and fails closed without the secret."));

c.push(H2("Layer 7 — Input validation & injection resistance"));
c.push(bullet([T("Zod schemas (src/lib/validations.ts) with "), M(".strict()"), T(" where mass-assignment matters; enums constrain predictions/status; amounts bounded.")]));
c.push(bullet([T("UUID format checks before DB calls to avoid 22P02 → 500 leakage (e.g. notifications/[id]/read).")]));
c.push(bullet([T("PostgREST filter hardening: search terms strip filter metacharacters "), M("[,()\"\\]"), T(" before LIKE-wildcard escaping (admin/users) — closes .or() filter injection.")]));
c.push(bullet("Chat moderation calls a fixed provider URL (no SSRF); user text is a classification target, not an instruction; fails closed."));

// 4 Key flows
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(H1("4. Critical server flows"));

c.push(H2("4.1 Card purchase (checkout → webhook → fulfilment)"));
c.push(...code([
  "POST /api/stripe/create-checkout-session",
  "  auth -> zod -> getPoolForUser -> price = pool.entry_fee (authoritative)",
  "  guardrails: pool open/active, <=3 cards, max_participants, >= platform min",
  "  stripe.checkout.sessions.create({ metadata:{poolId,userId,entryFee} })",
  "",
  "Stripe -> POST /api/stripe/webhook   (source of truth)",
  "  verify signature over RAW body; re-retrieve session; expand payment_intent",
  "  fulfillCardPurchase(serviceRole, session)",
  "",
  "Browser return -> POST /api/stripe/confirm-payment   (fast path)",
  "  auth; assert session.metadata.userId === user.id (403 otherwise)",
  "  fulfillCardPurchase(serviceRole, session)   // same fn, idempotent",
  "",
  "fulfillCardPurchase:",
  "  require payment_status==='paid'; amount_total === round(entryFee*100)",
  "  idempotency (a) lookup stripe_session_id  (b) UNIQUE 23505 => success",
  "  insert parlay_card + pool_transaction (fee derived by DB trigger)",
]));

c.push(H2("4.2 Settlement (scheduled)"));
c.push(...code([
  "GET /api/cron/settle    (requireSecret CRON_SECRET, fail-closed)",
  "runSettlement():",
  "  1. refreshGameScores()  ESPN -> games (never overwrite finished)",
  "  2. settleReadyPools():",
  "       completePoolIfAllGamesFinished()  (slate must be whole)",
  "       refuse zero-pot-with-paid-cards (warn, retry next tick)",
  "       materializePoolWinners():",
  "         computePoolWinners()  score card_picks vs finished games",
  "         cent-accurate split; insert pool_winners + payout_approvals",
  "         credit balance; idempotent via user_transactions unique index",
]));
c.push(note("Ordering constraint",
  [T("Phase 3 must not run before phase 2: computePoolWinners scores against finished games only, so on a partial slate it would crown whoever leads after the early window and pay the whole pot. The pool-completed gate makes the slate whole before scoring.")],
  "FBF3E6", AMBER));

c.push(H2("4.3 Withdrawal (request → admin approval → PayPal)"));
c.push(...code([
  "POST /api/me/payout-request   auth; amount>=min; balance>=amount;",
  "                              payout account linked; insert 'pending'",
  "PATCH /api/admin/payout-requests/[id]/complete   requireAdmin",
  "  idempotency on reference_id; validate PayPal account + mode",
  "  debit_user_balance (atomic reserve) -> createPayPalPayout ->",
  "  on failure: credit_user_balance (compensate); mark failed",
  "  on success: insert user_transactions; mark completed + batchId",
]));

// 5 Threat model
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(H1("5. Threat model (attack → control → layer)"));
c.push(table([2900, 4300, 1600],
  ["Attack", "Control", "Layer"],
  [
    ["Free/unpaid card", "Legacy self-serve route 410; entries only via Stripe; amount server-set", "L4"],
    ["Entry-fee tampering", "pool.entry_fee authoritative; webhook re-verifies amount_total", "L4"],
    ["Double fulfilment (race)", "Lookup + UNIQUE(stripe_session_id) idempotency", "L4"],
    ["Confirm another's session", "metadata.userId === caller (403)", "L2/L4"],
    ["Self-promotion to admin", "users UPDATE with_check pins role/balance", "L3"],
    ["Rewrite game score", "Admin-only route + admin-only RLS + score CHECK", "L2/L3"],
    ["Self-settle a pool", "Status writes admin-only; column unwritable by clients", "L2/L3"],
    ["Read opponents' picks", "Holder-only RLS; no permissive OR; API binds card to caller", "L3/L5"],
    ["Post-kickoff pick", "Kickoff lock in API + RLS", "L5"],
    ["Over-balance withdrawal", "API balance check + RLS amount<=balance; atomic debit", "L3/L4"],
    ["Float drain (concurrent payouts)", "Atomic debit reserves before PayPal", "L4"],
    ["Lost update on balance", "Single-transaction claim; relative balance math", "L4"],
    ["Private-pool self-join", "participants INSERT check (public or invited)", "L3"],
    ["Harvest emails/balances", "World-readable users policy removed; public_profiles projection", "L3"],
    ["Anonymous settlement/bootstrap", "requireSecret fail-closed + timing-safe", "L6"],
    ["Forged Stripe webhook", "Raw-body signature verification", "L6"],
    ["Open redirect (post-login)", "Same-origin relative-path validation + origin guard", "L7"],
    ["PostgREST filter injection", "Strip filter metacharacters before interpolation", "L7"],
    ["SSRF / prompt injection (chat)", "Fixed provider URL; input as classification target; fail closed", "L7"],
  ]));

// 6 Endpoint inventory (selected)
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(H1("6. Endpoint inventory (auth posture)"));
c.push(table([3600, 1500, 3700],
  ["Route", "Gate", "Notes"],
  [
    ["auth/signup, signin, signout, me", "public/auth", "zod-validated; no role mass-assignment"],
    ["auth/callback", "public", "post-login redirect restricted to same-origin path"],
    ["pools (GET/POST)", "public GET / auth POST", "public cols only in embeds; creator set to caller"],
    ["pools/[poolId] (GET/PATCH/DELETE)", "session/owner", "mutations require created_by === caller + no players joined"],
    ["pools/[poolId]/cards/[cardId]/{picks,lock,submit}", "auth+owner", "kickoff lock; holder binding"],
    ["stripe/create-checkout-session", "auth", "server-authoritative price"],
    ["stripe/confirm-payment", "auth", "session ownership assert"],
    ["stripe/webhook", "signature", "service-role; source of truth"],
    ["me/{balance,winnings,games,payout-request,payout-account,claim-payout}", "auth", "all scoped to user.id; claim via DB txn"],
    ["admin/** (users, payout-requests, pools/settings, sync/teams)", "requireAdmin", "service-role only after gate"],
    ["games/[gameId]/outcome", "requireAdmin", "validated non-negative scores"],
    ["cron/settle", "CRON_SECRET", "fail-closed; moves money"],
    ["seed-admin", "SETUP_SECRET", "one-time bootstrap; generic responses"],
    ["sync/nfl-games, pools/[poolId]/games/sync", "requireAdmin/owner", "data from ESPN, not client"],
    ["winners", "public", "get_public_winners RPC; completed pools; minimal projection"],
    ["notifications/[id]/read, invitations/**", "auth+owner", "UUID checks; ownership enforced"],
  ]), );

// 7 recent remediations
c.push(H1("7. Recent remediations"));
c.push(bullet([T("Open redirect", { bold: true }), T(" — auth/callback now validates "), M("next"), T(" is a same-origin relative path (rejects "), M("//"), T(", "), M("/\\"), T(", absolute URLs) with an origin guard.")]));
c.push(bullet([T("PostgREST filter injection", { bold: true }), T(" — admin/users strips "), M("[,()\"\\]"), T(" before wildcard escaping in the "), M(".or()"), T(" search.")]));
c.push(H3("Open follow-up (informational)"));
c.push(bullet([T("materialize-winners.ts credits the winner balance via read-then-write absolute update; recommend routing through "), M("credit_user_balance"), T(" for consistency with the other atomic money paths (narrow window; double-credit already guarded).")]));

c.push(new Paragraph({ spacing: { before: 300 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 8 } },
  children: [new TextRun({ text: "Technical reference — internal use. Pairs with the security audit and the plain-English overview.", italics: true, size: 17, color: GREY })] }));

// Exported so scripts/gen-combined-doc.cjs can assemble every document into one
// deliverable without duplicating a single line of this content. Running this file
// directly still writes its own .docx exactly as before.
if (require.main !== module) { module.exports = c; return; }

const doc = new Document({
  creator: "Gridiron Engineering",
  title: "Backend Architecture & Security — Technical Reference",
  description: "Technical reference for the backend architecture, data model, flows, and seven security layers",
  numbering: { config: [
    { reference: "b", levels: [
      { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 440, hanging: 250 } } } },
      { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 880, hanging: 250 } } } },
    ]},
  ]},
  styles: {
    default: { document: { run: { font: "Calibri", size: 21, color: "222222" } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Calibri", size: 30, bold: true, color: NAVY }, paragraph: { spacing: { before: 300, after: 140 }, keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Calibri", size: 24, bold: true, color: BLUE }, paragraph: { spacing: { before: 220, after: 90 }, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Calibri", size: 21, bold: true, color: "3A3A3A" }, paragraph: { spacing: { before: 150, after: 60 }, keepNext: true } },
    ],
  },
  sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, bottom: 1150, left: 1300, right: 1300 } } }, children: c }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(process.argv[2] || "Backend_Architecture_Technical.docx", buf);
  console.log("WROTE", buf.length, "bytes");
});
