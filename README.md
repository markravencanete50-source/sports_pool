# Gridiron — NFL Sports Pool Platform

A Next.js application for running real-money NFL prediction pools. Players buy
parlay cards, predict a slate of games, and the platform scores the results and
pays the winners automatically.

> **This handles real money.** Entry fees are taken with Stripe, winnings are
> credited to an in-app balance, and withdrawals are sent via PayPal Payouts.
> Read [Security model](#security-model) and [Settlement](#settlement) before
> changing anything in `src/lib/` or `supabase/migrations/`.

---

## Contents

- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Database setup](#database-setup)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [API routes](#api-routes)
- [Security model](#security-model)
- [Settlement](#settlement)
- [Deployment](#deployment)
- [Self-hosting with Docker](#self-hosting-with-docker)
- [Backup, recovery and incident response](#backup-recovery-and-incident-response)
- [Known technical debt](#known-technical-debt)

---

## How it works

1. **Sign up** — Supabase Auth (email + password, min 10 chars with mixed case
   and a digit).
2. **Join a pool** — pay the entry fee through Stripe Checkout. The price is set
   by the pool server-side; the client cannot influence it.
3. **Get a card** — issued only after Stripe confirms payment (webhook is the
   source of truth). Up to 3 cards per user per pool.
4. **Make picks** — predict each game. Picks for a game lock at its kickoff.
5. **Games play** — final scores are pulled from the ESPN scoreboard feed.
6. **Settle** — once every game in a pool is finished, cards are scored, winners
   are chosen (ties broken by closest total-score prediction) and the pot, less
   the platform fee, is credited to the winners' balances.
7. **Withdraw** — the player requests a payout; an admin approves it and the
   money is sent to their PayPal.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, route handlers) |
| Language | TypeScript (strict) |
| Database / Auth | Supabase (PostgreSQL + Row Level Security + GoTrue) |
| Payments in | Stripe Checkout + webhooks |
| Payments out | PayPal Payouts |
| Sports data | ESPN public scoreboard API |
| Data fetching | TanStack React Query |
| Validation | Zod |
| Styling | Tailwind CSS 4 + Radix UI |
| Rate limiting | Upstash Redis (optional; in-memory fallback) |
| Scheduling | Vercel Cron + GitHub Actions |

---

## Getting started

### Prerequisites

- **Node.js 22** (matches the Dockerfile and CI; Next 16 requires ≥ 18.18)
- **npm** — this repo standardises on npm and commits only `package-lock.json`.
  Do not add a second lockfile; CI runs `npm ci`.
- A Supabase project (free tier is fine)
- Stripe and PayPal accounts for the money paths

### Install and run

```bash
git clone <repository-url>
cd sports_pool
npm ci
cp .env.example .env.local   # then fill it in
npm run dev                  # http://localhost:3000
```

---

## Database setup

**The migrations in `supabase/migrations/` are the single source of truth.** They
define every table, index, function (RPC), trigger and RLS policy.

```bash
npx supabase link          # link to your project
npm run db:migrate         # supabase db push — applies all migrations
npm run seed               # optional: reference/demo data
```

Then bootstrap the first admin once, and unset the secret afterwards:

```bash
curl -X POST "$NEXT_PUBLIC_APP_URL/api/seed-admin" \
  -H "Authorization: Bearer $SETUP_SECRET"
```

> ⚠️ **Applying to the EXISTING production database? Repair the history first.**
>
> Two migrations previously shared the version `20260805000000`, which makes
> `supabase db push` abort on a fresh database. One was renamed to
> `20260805000003`, and `20260804000000` was edited to drop a leftover policy
> that made its own invariant assertion fail (that assertion aborted the whole
> migration, so **no database could be provisioned from this repo at all**).
>
> Both changes are correct and verified against a scratch database, but the
> production database already records the old version. Run this once, against
> production only:
>
> ```bash
> supabase migration repair --status reverted 20260805000000
> supabase migration repair --status applied  20260805000003
> ```
>
> Re-applying `20260805000003` would be harmless anyway — it is entirely
> `revoke` / `create or replace` — but the repair keeps the history honest.
> A brand-new database needs none of this: just `npm run db:migrate`.

> The migrations are the ONLY way to provision. A stale `schema.sql` snapshot
> used to sit at the repo root; it has been deleted, because it was missing the
> entire balance/payout subsystem and several RPCs, so a database built from it
> appeared to work right up until money moved.

For local development against a containerised stack, `npm run db:start` /
`db:stop` / `db:reset` wrap the Supabase CLI.

---

## Environment variables

`.env.example` documents every variable the app reads. The ones without a safe
default:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server Supabase access (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Bypasses all RLS.** Server-only, never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_URL` | Base URL for Stripe redirects and auth emails |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Checkout |
| `STRIPE_WEBHOOK_SECRET` | Verifies webhook signatures. Without it the webhook fails closed and **players are charged with no card issued** |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE` | Withdrawals |
| `CRON_SECRET` | Gates `/api/cron/settle`. Unset ⇒ 503, settlement never runs |
| `SETUP_SECRET` | Gates the one-time admin bootstrap. Unset it again after use |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Optional. Enables global rate limiting; without it limits are per-instance only |

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` — **blocking in CI** |
| `npm test` | Settlement regression suite — **blocking in CI** |
| `npm run lint` | ESLint — **blocking in CI**. Pre-existing style debt is configured as warnings, so this blocks only on new errors |
| `npm run check` | typecheck + test + lint, all at once |
| `npm run db:migrate` | Apply migrations |
| `npm run seed` / `seed:admin` | Seed data / promote the admin account |

`npm test` runs `scripts/verify-settlement.ts`, which exercises scoring,
tie-breaking and the cent-exact pot split (including a swept rounding check
across 243 combinations). **Treat a failure here as a release blocker.**

---

## Project structure

```
src/
├── app/
│   ├── (marketing)/          # public landing, terms, privacy, contact
│   ├── (auth)/               # login, signup, auth/callback
│   ├── (app)/                # authenticated app: dashboard, pools, my-games, admin
│   └── api/                  # route handlers (the backend)
├── components/               # UI, grouped by feature
├── lib/
│   ├── hooks/                # React Query data hooks
│   ├── supabase/             # server (RLS) and admin (service-role) clients
│   ├── winners.ts            # scoring + pot split  ← money
│   ├── settle-pools.ts       # settlement pipeline   ← money
│   ├── materialize-winners.ts# winner persistence    ← money
│   ├── fulfill-card-purchase.ts # Stripe fulfilment  ← money
│   ├── rate-limit.ts         # Upstash + in-memory limiter
│   ├── request-guards.ts     # CSRF / same-origin
│   └── validations.ts        # Zod schemas
└── proxy.ts                  # route protection middleware (Next 16 names it proxy.ts)

supabase/migrations/          # single source of truth for the database
scripts/                      # seeds, settlement regression suite, doc generators
```

---

## API routes

All handlers live under `src/app/api/`. Auth posture in brief:

**Public** — `GET /api/pools`, `GET /api/pools/[poolId]`, `GET /api/games`,
`GET /api/games/[gameId]`, `GET /api/winners`, `POST /api/newsletter/subscribe`.

**Authenticated** — `/api/auth/*`, `/api/me/*` (balance, games, winnings,
payout-account, payout-request, claim-payout), `/api/pools` (POST),
`/api/pools/[poolId]/cards*`, `/api/pools/[poolId]/chat`, `/api/invitations/*`,
`/api/notifications/[id]/read`, `/api/stripe/create-checkout-session`,
`/api/stripe/confirm-payment`.

**Admin only** — `/api/admin/*`, `/api/games/[gameId]/outcome`,
`/api/sync/nfl-games`, `/api/pools/complete-finished`.

**Secret-gated (no session)** — `/api/cron/settle` (`CRON_SECRET`),
`/api/seed-admin` (`SETUP_SECRET`).

**Signature-gated** — `/api/stripe/webhook` (Stripe signature *is* its auth).

**Removed, deliberately `410 Gone`** — `POST /api/pools/[poolId]/cards/purchase`
(issued unpaid cards) and `POST /api/pools/[poolId]/cards/[cardId]/submit`
(wrote to a table settlement ignores). They return 410 rather than 404 so any
straggler caller fails loudly.

---

## Security model

Defence in depth, seven layers. The guiding rule: **the database is the
authorization boundary — an API bug alone must not be able to leak or move
money.**

1. **Authentication** — Supabase JWT in HTTP-only cookies, verified per request.
2. **Authorization** — `requireAdmin()` for role gates; every object is bound to
   the caller in the query (`.eq("user_id", user.id)`) to prevent IDOR.
3. **Row Level Security** — holder-only cards and picks, own-row profiles with
   `role`/`balance` pinned, money tables writable only by the service role. See
   `supabase/migrations/20260804000000_security_hardening_rls.sql`; it ends with
   an assertion that fails the migration if an unexpected SELECT policy exists.
4. **Money integrity** — server-authoritative pricing, Stripe signature
   verification over the raw body, two-layer idempotency (pre-check + unique
   index), atomic balance moves via `debit_user_balance` / `credit_user_balance`,
   and cent-exact pot splitting.
5. **Game integrity** — picks are private to their holder and lock at kickoff,
   enforced in both the API and RLS.
6. **Secrets & automation** — `requireSecret()` fails closed (503) and compares
   timing-safely; scheduled jobs and the admin bootstrap are secret-gated.
7. **Input handling** — Zod validation, UUID checks, PostgREST filter
   sanitisation, rate limiting, and same-origin (CSRF) checks on money mutations.

Security headers and a CSP are set in `next.config.ts` (the Stripe webhook path
is excluded, as browser headers do not apply to a server-to-server POST).

---

## Settlement

`/api/cron/settle` runs the pipeline in `src/lib/settle-pools.ts`:

1. **Refresh scores** — pull finals from ESPN for every `(season, week)` that
   still has unfinished games.
2. **Complete pools** — flip a pool to `completed` only once its whole slate is
   finished.
3. **Materialize winners** — score the cards, pick winners, credit balances.

Every phase is idempotent; the job runs on a schedule and may be retried.

It is triggered from **two** schedulers, which is safe by design:

- `vercel.json` — daily at 08:00 UTC (works on any Vercel plan).
- `.github/workflows/settle-pools.yml` — every 30 minutes, for game-day latency.
  Requires a `CRON_SECRET` Actions secret; without it the workflow **skips with a
  warning** rather than failing, so it never trains the team to ignore its email.

The platform fee is **locked per pool at creation** (`pools.platform_fee_percentage`),
so changing the global rate mid-pool cannot re-split an in-flight pot.

---

## Deployment

### Vercel (recommended)

1. Import the repository.
2. Set every variable from [Environment variables](#environment-variables).
3. Point a Stripe webhook at `https://<your-domain>/api/stripe/webhook` for
   `checkout.session.completed`, and set `STRIPE_WEBHOOK_SECRET`.
4. Deploy, then run the one-time admin bootstrap.

CI (`.github/workflows/ci.yml`) gates every push and PR on typecheck, the
settlement tests and a production build.

---

## Self-hosting with Docker

`docker-compose.yml` brings up the app plus a full self-hosted Supabase stack
(Postgres, GoTrue, PostgREST, Realtime, Kong) and an optional Cloudflare tunnel.

```bash
cp .env.docker.example .env.docker   # then fill it in
npm ci && npm run build              # the image copies a PREBUILT .next/standalone
docker compose build
docker compose up -d
```

Two things to know:

- **The Dockerfile does not build the app.** It copies `.next/standalone`, so you
  must `npm run build` on the host first.
- **Settlement runs via the `settle-cron` service**, which calls
  `/api/cron/settle` every 15 minutes. It needs `CRON_SECRET` in `.env.docker`
  — without it the endpoint fails closed (503) and nobody gets paid.

---

## Backup, recovery and incident response

This system holds player balances and an append-only money ledger. Losing or
corrupting either is unrecoverable by other means, so treat the following as
part of go-live, not as an afterthought.

### Backups

| What | How | Cadence |
|---|---|---|
| Database | Supabase Point-in-Time Recovery (**Pro plan or above** — the free tier only keeps daily logical backups) | Continuous, ≥ 7-day retention |
| Pre-migration snapshot | `supabase db dump -f pre-<migration>.sql` before every `db:migrate` against production | Every schema change |
| Verification | Restore the latest backup into a scratch project and run `npm test` plus a spot-check of `user_transactions` totals | Monthly |

A backup nobody has restored is a hypothesis, not a backup. The monthly restore
drill is the only thing that turns it into a fact.

### Reconciliation invariant

The ledger is the source of truth for money, and it should always agree with the
balances:

```sql
-- Every user's balance must equal the sum of their ledger movements.
select u.id, u.balance, coalesce(sum(t.amount), 0) as ledger
from public.users u
left join public.user_transactions t on t.user_id = u.id
group by u.id, u.balance
having u.balance <> coalesce(sum(t.amount), 0);
```

**Any row returned here is an incident.** Run it after every settlement run and
after any manual database intervention.

### Rolling back a migration

Migrations are forward-only; there are no down scripts. To roll back:

1. Restore the pre-migration snapshot into a scratch project and confirm it is
   intact.
2. Take the app offline (settlement in particular — an unset `CRON_SECRET`
   stops it immediately and fails closed).
3. Restore over production, then run `supabase migration repair` so the recorded
   history matches what is actually applied.

### Monitoring

The money paths log at `error`/`warn` with a stable prefix. At minimum, alert a
human on:

- `FULFILMENT FAILED` — a player was charged and got no card; needs a refund.
- `CRITICAL` — a payout was sent but the ledger write or status update failed.
- `refusing to settle at zero` / `completed but produced no winners` — a pool is
  holding player money.
- `Refusing to re-materialise` — something tried to settle an already-paid pool.
- Any non-200 from `/api/cron/settle`.

Vercel captures stdout, but console output is not an alerting system. Ship these
to something that can page someone (Sentry, Better Stack, Datadog) before taking
real money.

---

## Known technical debt

Tracked deliberately, none of it blocking:

- ~~**~150 `any` annotations**~~ — **cleared 2026-08-10.** Shared domain models,
  route-local row types, and the ESPN feed mapping are typed;
  `@typescript-eslint/no-explicit-any` is back at `error`.
- ~~**React hooks lint findings**~~ — **cleared 2026-08-10.** Pagination resets
  moved into filter handlers / debounce callbacks, derived-in-render replaced
  sync effects where possible, and `set-state-in-effect` is back at `error`;
  the few genuine server-sync effects carry justified per-line disables.
- **No static generation** — the nonce-based CSP requires per-request rendering,
  so every page is dynamic (`export const dynamic = "force-dynamic"` in the root
  layout). This is a deliberate trade: a per-request nonce cannot authorise
  pre-rendered HTML, and dropping `'unsafe-inline'` from `script-src` was judged
  worth more than CDN-caching the marketing pages. To recover static rendering
  for public pages, serve them a separate nonce-free CSP and scope
  `force-dynamic` to the authenticated routes.
- **Migration history repair needed on the existing production database** — see
  the warning under [Database setup](#database-setup). A fresh database is fine;
  only the already-provisioned one needs the one-off `migration repair`.
- **`src/lib/supabase/types.ts`** — generated types that are both stale and
  unwired (the clients are created without the `Database` generic, so queries are
  not type-checked against the schema). Regenerate with
  `npx supabase gen types typescript --linked` and parameterise the clients to
  make it real.
- **Legacy `picks` table** — superseded by `card_picks`. Its write route is now
  410; the table itself can be dropped once you are sure nothing reads it.

---

## Contributing

1. Branch from `main`.
2. Make your change; run `npm run check` before pushing.
3. Open a pull request — CI must be green.

## License

MIT.
