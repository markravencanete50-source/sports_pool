# Operations Runbook — Sports Pool

The failure modes that matter on this product are the quiet ones that move or
strand money. This document says what to do about each, before it happens.
Keep it honest: when a procedure here is wrong or incomplete, fixing the
runbook is part of closing the incident.

**Where errors surface.** Server money-path failures and client crash reports
land in the `app_errors` table (service-role only — query it from the Supabase
dashboard SQL editor). Structured JSON logs (`logEvent`) go to the Vercel log
stream. The reconciliation cron files every processor/ledger mismatch into
`app_errors` with the prefix `RECONCILIATION MISMATCH`.

```sql
-- The morning check
select created_at, source, left(message, 120), digest, url
from app_errors
order by created_at desc
limit 50;
```

---

## 1. Incidents

### 1.1 A user paid but has no card

**Detected by:** `app_errors` row `Stripe fulfilment failed — manual refund
review required`, or the reconcile cron reporting a paid session with no
ledger row, or the user.

1. Find the session in the Stripe dashboard (the `digest` column carries the
   session id). Confirm `payment_status = paid`.
2. Decide fulfil vs refund. Fulfil only if the pool is still open and the user
   holds fewer than 3 cards; otherwise refund in Stripe — a refund is always
   the safe answer.
3. To re-attempt fulfilment, use Stripe dashboard → the event → "Resend" on
   the `checkout.session.completed` webhook. Fulfilment is idempotent; a
   duplicate resend cannot double-issue.
4. If fulfilment keeps failing, the error text says why (pool closed, card
   limit). Refund and tell the user.

### 1.2 PayPal payout failed

**Detected by:** `payout.paypal_failed` in logs; the CRITICAL variant lands in
`app_errors`.

Two shapes:

- **PayPal failed, refund succeeded** (normal): the balance was restored and
  the request returned to pending. Fix the cause (usually the receiver email
  or PayPal credentials) and complete it again.
- **PayPal failed AND the refund failed** (CRITICAL row in `app_errors`): the
  user's balance was debited and no money moved. Manually credit the balance:
  `select credit_user_balance('<user_id>', <amount>);` (service role), then
  verify against `user_transactions` before retrying anything.

### 1.3 Pool settled wrong / disputed result

1. Do NOT edit balances directly. Reconstruct first: `pool_winners`,
   `card_picks`, and `games` rows for the pool tell you what the engine saw.
2. If a game's final score was wrong at settlement time, correct it via
   `PUT /api/games/[gameId]/outcome` (admin), then re-run settlement reasoning
   by hand — settlement does not automatically reverse paid winners
   (deliberately: see `materialize-winners`).
3. Any manual correction must write a compensating `user_transactions` row so
   the ledger explains itself later.

### 1.4 Stripe or PayPal outage

- Checkout fails closed (no card without payment) — no action needed beyond
  status-page awareness.
- Payout completion fails closed (refund path above) — pause approving
  payouts until the processor recovers.

### 1.5 Settlement cron did not run

Vercel → Project → Cron Jobs shows the last invocations of
`/api/cron/settle` (hourly). A 503 means `CRON_SECRET` is unset; a 401 means
it does not match. Settlement is idempotent per pool, so once it runs again
it catches up on everything pending.

**Self-hosted (Docker/VPS):** the schedulers are the `settle-cron` and
`reconcile-cron` compose services. `docker compose logs settle-cron` shows one
line per invocation with the HTTP status; the same 503/401 readings apply
(`CRON_SECRET` lives in `.env.docker`). If the service is missing entirely —
`docker compose ps` does not list it — nothing is calling settlement and pools
will quietly hold player money: bring the full compose stack up, not just
`nextjs`.

---

## 2. Backup and restore (database)

The database of record is Supabase Postgres. **The ledger tables
(`users.balance`, `pool_transactions`, `user_transactions`,
`payout_requests`, `pool_winners`) are financial records** — treat backup
policy as non-optional.

- **Enable**: Supabase dashboard → Project → Database → Backups. Daily
  backups are on for all plans; Point-in-Time Recovery (PITR) is a paid
  add-on and is what you actually want before launch — a daily snapshot can
  lose up to 24h of money movements.
- **Restore rehearsal (do this once before launch, then quarterly)**:
  1. Create a scratch Supabase project.
  2. Restore the latest backup into it (dashboard → Backups → Restore, or
     `pg_dump`/`pg_restore` against the connection strings).
  3. Run the app against it locally (`.env.local` pointed at the scratch
     project) and verify a pool, its transactions and a balance figure match
     production.
  4. Record the date and duration in this file:
     - _Last rehearsal: (never — do before launch)_
- **What a restore does NOT bring back**: Stripe/PayPal state. After any
  restore, run `/api/cron/reconcile` immediately and work every mismatch it
  files.

### 2.1 Backups when the database is bundled with the app

Everything above assumes managed Supabase, where backups are a dashboard
setting. **This section applies only if you run `--profile bundled-db`**, which
puts Postgres in a container on your own host. It is not the recommended
production shape, and backups are the main reason why: nothing snapshots
`./volumes/db/data` unless you arrange it, there is no free daily backup and no
PITR to buy, and the ledger in that volume is a financial record. If you find
yourself building the procedure below, reconsider managed Supabase first.

At minimum, a nightly logical dump kept off the same machine:

```bash
docker compose exec -T db pg_dump -U postgres -Fc postgres > sp-$(date +%F).dump
```

Notes that matter:

- **Off the box.** A dump beside the database is not a backup; it dies with the
  disk. Ship it to object storage or another host.
- **Test the restore, not the dump.** `pg_restore` into a scratch container and
  run the reconciliation invariant query in §5 of the README against it.
  A backup nobody has restored is a hypothesis.
- **Retention.** Keep enough history to survive a corruption you notice late.
  Financial records argue for weeks, not days.
- **Point-in-time recovery** is possible with continuous WAL archiving, which
  is a real piece of setup. If the client wants PITR without operating it,
  managed Supabase is the easier answer and that is a legitimate reason to
  prefer it over self-hosting the database.
- Record each rehearsal date here, as above.

---

## 3. Provisioning that must happen before launch

> **Check your work with one command.** `/api/health` reports every item below.
> Anonymous callers get a status code only; with the secret you get the
> breakdown naming each unset variable and what it costs:
>
> ```
> curl -s -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/health
> ```
>
> Missing money-path credentials report **degraded at HTTP 200**, not 503 — the
> site genuinely serves without them, and a probe that screams for the whole
> handover period is one nobody reads later. `status: "ok"` means fully
> provisioned. Work the list until it says that.

| Item | Where | Why |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` (secret) → Vercel env, **Production** | **This was unset in production for eight days and nobody noticed.** Every service-role path dies without it: settlement never completes and the Stripe webhook cannot fulfil a purchase, so a user can be charged and receive nothing. The public site keeps serving normally, which is exactly why it went unnoticed. Never expose it to the browser or prefix it `NEXT_PUBLIC_` — it bypasses every RLS policy |
| Upstash Redis credentials | **Easiest:** Vercel → Storage → Create Database → Upstash → Redis → connect to the project. It auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`, which the limiter reads directly — no manual variables. **Or by hand:** console.upstash.com → create a DB → set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`. Either naming works; do not mix them. Pick a region matching the database's (e.g. `pdx1` for a `us-west-2` database) | Without them every rate limit is per-instance in-memory — the sign-in throttle multiplies by the number of warm instances. The integration path injects `KV_`-prefixed names, **not** `UPSTASH_`; the code accepts both, but a database connected with the read-only token will fail under load — use the full-access `KV_REST_API_TOKEN` |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Webhooks → the production endpoint (`/api/stripe/webhook`, event `checkout.session.completed`) | Wrong or unset secret = users charged with no card issued. Unset is verifiable from outside: the webhook answers `503 {"error":"Webhook not configured"}` instead of `400 Missing stripe-signature` |
| `PAYPAL_MODE=live` + production client id/secret | Vercel env | The code fails closed to "not configured", so payouts simply won't send until this is right |
| `CRON_SECRET` | **Two places.** Vercel env, **and** GitHub → Settings → Secrets and variables → Actions | Vercel: settlement, reconciliation and the alert digest answer 503 until set. GitHub: without the Actions secret `settle-pools.yml` and `alert.yml` **skip and still report success** — a green workflow doing nothing. Both values must match. Verify by running either workflow manually and confirming its trigger step says success, not skipped |

| Unset `SETUP_SECRET` | Host env | Hygiene only, no longer a hole. `/api/seed-admin` now refuses with 410 once any admin exists, so a forgotten secret cannot reopen the bootstrap path |
| Function region | Vercel → Settings → Functions → Region → the region nearest the database (`pdx1` for `us-west-2`) | Functions default to `iad1` (Washington). A database on the opposite coast adds a cross-country round trip to every query, and purchase and settlement make several each. Match the region; a healthy database check should read tens of ms, not 200+ |
| MFA for admin accounts | Enrol at `/account/security` (TOTP) | **Built and enforced** — see §4. Every admin must enrol; payout approval, role changes and platform-fee edits refuse a session without a verified factor |
| PITR backups | Supabase dashboard | See §2 |

**Environment variables only apply to new deployments.** Vercel snapshots them at
deploy time, so adding one changes nothing until you redeploy. After setting any
row above: Deployments → latest → ⋯ → Redeploy.

### 3.1 Self-hosted (Docker/VPS) differences

The **Where** column above names Vercel because that is where this project was
first deployed. On the self-hosted stack every one of those values instead goes
into `.env.docker` beside `docker-compose.yml`, and the equivalent of a redeploy
is `docker compose up -d`, which recreates the containers so they re-read the
file. Restarting only the `nextjs` service is enough for app-level variables;
anything the Supabase containers read needs the whole stack.

Four items are specific to this shape, and the first is the one that bites:

| Item | Why |
|---|---|
| `TRUSTED_PROXY=cloudflare` | **Load-bearing, and it fails silently.** The stack terminates ingress at the cloudflared tunnel, and this variable is what tells the app to trust that edge for the visitor's IP and location. Without it every location is unverifiable, and because the compliance gate correctly fails closed on an unknown location, **every purchase and payout is refused while the site otherwise looks completely healthy.** Nothing appears in the error log, because a compliance refusal is a correct outcome rather than a fault. Do **not** set it if the origin is reachable directly, bypassing the tunnel — the header would then be attacker-supplied. For region-level rules (blocking `US-WA` rather than all of `US`), also enable Cloudflare's "Add visitor location headers" managed transform so `cf-region-code` arrives |
| The two scheduler services | `settle-cron` and `reconcile-cron` in `docker-compose.yml` replace the `vercel.json` crons. They ship with the stack, but only run if you bring the whole stack up — `docker compose ps` must list both. Without `settle-cron` nobody is paid; without `reconcile-cron` payment-to-ledger divergence goes undetected |
| `CRON_SECRET` in Actions (still) | The error-digest workflow (`alert.yml`) has no compose equivalent and still polls from GitHub Actions. Point its `APP_URL` secret at the VPS's public URL, or add a third sidecar following the same pattern and disable the workflow so the window is not paged twice |
| `ALLOW_SANDBOX_PAYOUTS` | Test window only. A self-hosted production build is `NODE_ENV=production` even while running sandbox tests, so the sandbox-payout guard refuses unless this is exactly `true`. **Remove it before taking real money.** `/api/health` reports sandbox-in-production as degraded regardless, so the state stays visible |

`/api/health` covers all four alongside everything in the table above, so the
same single request answers whether a self-hosted deployment is fully
provisioned.

## 4. Known-open items (by design or pending external action)

- **Admin MFA (audit BE-4) — BUILT AND ENFORCED.** Both halves shipped:
  `src/lib/require-admin.ts` requires `aal2` on payout completion, role changes
  and platform-fee edits, and `/account/security` is the TOTP enrolment screen
  (QR + verify) driving `/api/me/mfa`. The rollout order is deliberate and safe:
  the check refuses an admin who holds *no* factor with `mfa_enrollment_required`
  while leaving the enrolment routes ungated, so nobody can be locked out of
  enrolling. **Each admin must enrol at `/account/security` before they can
  approve a payout.**
- **E2E money-path test (BE-10)**: requires real Stripe test-mode keys;
  procedure sketch lives in the audit document §9.A. Run it before the first
  real deposit.

## 5. Admin bootstrap and offboarding

**Creating the first admin** (once per environment):

1. The person signs up normally through `/signup`.
2. Set `ADMIN_USER_EMAIL` to their address and `SETUP_SECRET` to a generated
   value on Vercel, then redeploy. (Self-hosted: set both in `.env.docker` and
   restart the `nextjs` service. The secret does not need to match any other
   environment's — generate a fresh one per server.)
3. `POST /api/seed-admin` with `Authorization: Bearer $SETUP_SECRET`. Read the
   response, not just the status line: 200 means the admin exists; 503 means
   `ADMIN_USER_EMAIL` is unset; 409 means that account has not signed up yet.
   Only a 200 is a completed bootstrap.
4. They enrol TOTP at `/account/security`. Until they do, they can sign in but
   cannot approve payouts or change roles.
5. Unset `SETUP_SECRET` and redeploy (self-hosted: remove it from `.env.docker`
   and restart). Optional now — the endpoint answers 410 once an admin exists —
   but it keeps the surface minimal.

**Creating further admins:** an existing enrolled admin promotes them through
the admin UI. Do not reuse the bootstrap endpoint; it is closed after step 3.

**Offboarding — do all four, in order:**

1. Demote to `user` via the admin UI. This is what removes authority; the rest
   is cleanup.
2. Revoke their sessions in Supabase Auth (Dashboard → Authentication → Users →
   the account → sign out / revoke). A demoted admin holding a live JWT keeps an
   `app_metadata.role` claim until it expires — the API re-checks the database,
   so they cannot act, but revoking closes the window properly.
3. Remove their TOTP factor in Supabase Auth so a retained authenticator is not
   a live second factor.
4. Confirm in `admin_audit_log` that nothing unexpected happened in their final
   session, and rotate any shared secret they held (`CRON_SECRET`,
   `SETUP_SECRET`, processor keys).

## 6. Disputes and support

A player *will* contest a settlement. Decide the owner before it happens, not
during.

**The evidence, in order of authority:**

1. `pool_winners` — who was credited, how much, against which card.
2. `user_transactions` — the immutable ledger. Every credit and debit, with the
   unique index that makes a double payout impossible. This is the record of
   truth in a dispute.
3. `pool_games` final scores plus `parlay_cards` / `card_picks` — reconstructs
   the scoring decision. Settlement is deterministic: the same inputs always
   produce the same winner, and `scripts/verify-settlement.ts` pins that
   behaviour over 243 payout combinations.
4. `admin_audit_log` — whether a human changed anything.
5. `compliance_events` — whether a compliance control (age, jurisdiction,
   self-exclusion, limits, KYC) refused the action.

**Rules of engagement:**

- Never adjust a balance with a raw SQL `UPDATE`. It bypasses the ledger and
  destroys the audit trail that resolves the *next* dispute. Corrections go
  through a transaction row so the history stays additive.
- A settlement result is only wrong if an input was wrong (a bad final score, a
  missing pick). Fix the input and re-run settlement; do not hand-edit an
  outcome.
- Anything touching money needs a second person's sign-off, recorded in
  `admin_audit_log`.
- Name the owner: **decide who investigates, who may authorise a correction, and
  the response-time commitment you publish.** That is an organisational choice
  this document cannot make for you — but the mechanics above are ready for
  whoever it is.

## 7. Moving the project to the client's accounts

> **Which path applies.** Sections 7.1 to 7.4 describe moving to the client's
> own **managed Supabase + Vercel** accounts. If the client is deploying the
> **self-hosted Docker stack on their own VPS** — the current plan — most of it
> does not apply, because the stack brings its own Postgres, auth and gateway.
> Read **7.4** instead, then 7.3 for the repository.

Three accounts hold this project: Supabase (database), Vercel (hosting) and
GitHub (source). They move independently, and the database is the only one with
a real decision in it.

### 7.1 The database: provision fresh, do not transfer

**Recommendation: create a new Supabase project in the client's organisation and
provision it from the migrations.** Two reasons, and the first is close to
decisive.

**This project is Vercel-managed, not a standalone Supabase project.** Its
organisation id is `vercel_icfg_…`, which means it was provisioned through
Vercel's marketplace integration and is billed and administered through the
Vercel account rather than through Supabase directly. Those projects do not move
between Supabase organisations the way a normally-created project does — the
ownership question is really "who owns the Vercel account", and untangling that
is more work than provisioning a clean database.

**Second, there is nothing to preserve.** Supabase can transfer a project
between organisations, and that is the right tool when a database holds data you
cannot afford to lose. This one does not:

| Table | Rows | Comes back from |
|---|---|---|
| `users`, `pools`, `parlay_cards`, `pool_transactions`, `user_transactions`, `pool_winners`, `payout_requests` | **0** | nothing to migrate |
| `compliance_settings`, `jurisdiction_rules` | seeded | the migrations |
| `platform_settings` | 1 | `npm run seed` |
| `teams` | 32 | `npm run seed`, or automatically on the first NFL sync |
| `games` | 49 | the ESPN sync; reference data, refetched |

With no user data, a fresh provision is cleaner than a transfer: the client owns
the project from the first row, there is no shared billing history, and none of
the development-era configuration follows it across.

**Provisioning a new project, in order:**

> **This procedure has now been run end to end.** A clean provision onto a
> client's own Supabase project applied all 35 migrations, passed the invariant
> script, and brought the site up with 14 of 14 external assertions green. It
> also surfaced three latent defects that only a from-scratch build could expose
> (a role-coupled migration self-test, a documentation invariant firing on
> functions the source database lacked, and the `KV_` vs `UPSTASH_` naming) — all
> fixed. Expect the steps below to work; run the verification anyway.

1. Create the project in the **client's** Supabase organisation. Choose a region
   near where the Vercel functions will run, and pin the function region to match
   (§3). For a `us-west-2` database, use `pdx1` functions; for `us-east-1`, `iad1`.
2. Apply the schema:
   ```
   supabase link --project-ref <new-ref>
   npm run db:migrate
   ```
   All 35 migrations apply cleanly to an empty database. This is verified by
   `npm run check:migrations` on every commit, and it is not a given: three
   migrations shared duplicate version prefixes at one point, which would have
   silently skipped them on exactly this operation. Run `db:migrate` **from the
   repo directory** — linking from elsewhere writes the link into that other
   folder and `db:migrate` then silently applies nothing.
3. Seed the configuration the migrations do not carry:
   ```
   npm run seed
   ```
   This inserts `platform_settings` (the platform fee and minimum entry fee) and
   the NFL teams. **Do not skip it.** Settlement falls back to a 10% fee when the
   row is absent, so a missed seed does not crash — it quietly charges a default
   the client never chose. `ADMIN_USER_EMAIL` is optional here — the seed skips
   the admin cleanly if it is unset, leaving account creation to the client (§5).
4. **Prove the money guards survived the rebuild.** Applying without error is not
   the same as the controls being live. Paste `scripts/verify-provision.sql` into
   the SQL Editor: seven structural checks (RLS coverage, migration count, the
   double-credit index, one-way self-exclusion, no policy recursion, helper
   grants, money columns not client-writable) plus a behavioural check that a real
   session can rename itself but not escalate. All must read PASS.
5. Copy the new project's URL, anon key and service-role key into Vercel, wire the
   remaining provisioning (§3), then redeploy.
6. Create the first admin — §5.
7. Confirm with `/api/health` (§3) that every component reports `ok`, and run the
   black-box suite against the live URL:
   ```
   E2E_BASE_URL=https://<domain> npm run test:e2e
   ```

**Which Supabase account the client should use.** Either a standalone account at
supabase.com, or their own Vercel integration. Standalone is preferable: it
keeps database ownership independent of the hosting account, so changing hosting
provider later does not also mean moving the database. The current arrangement —
database owned by the Vercel account — is exactly the coupling that makes this
handover more awkward than it needs to be.

**Note on backups.** Point-in-time recovery requires a paid Supabase plan. The
current organisation is on the free plan, so this is a decision the client makes
when they create their project, not something that carries across.

**When a transfer would be right instead:** once the platform holds real player
balances. At that point the ledger cannot be recreated and the project should be
transferred through Supabase's own flow rather than rebuilt — but that also
means resolving the Vercel-managed ownership question first.

### 7.2 Hosting

Either transfer the Vercel project to the client's team, or have them create a
new project from the same repository. Creating fresh is usually simpler — the
only state a Vercel project holds is environment variables and domains, and the
variables have to be re-entered by whoever owns the credentials anyway.

Whichever route, after the move:

- Re-enter every variable in §3 in the new project.
- **Redeploy.** Environment variables are snapshotted into a deployment.
- Update `APP_URL` in the GitHub Actions secrets if the domain changes;
  `settle-pools.yml` and `alert.yml` default to the old production URL.
- Re-point the Stripe webhook endpoint at the new domain and put the **new**
  signing secret into `STRIPE_WEBHOOK_SECRET`. The secret is per endpoint; the
  old one will not verify.

### 7.3 Source

Transfer the GitHub repository to the client's account, or have them fork it.
Transferring keeps the history, which is worth having: the commit messages
record why each security control exists, and several of them are the only
explanation of a decision that looks arbitrary otherwise.

After a transfer, re-add the Actions secrets (`CRON_SECRET`, optionally
`APP_URL`) — repository secrets do not follow a transfer.

### 7.4 Moving hosting to a VPS

**Recommendation: move the app, keep the database where it is.** `docker compose
up -d` runs the Next.js app, both schedulers and the tunnel against the existing
managed Supabase project. Hosting moves; the database does not.

That is the safer split, for three reasons that all point the same way:

- **Backups.** Managed Supabase keeps daily backups on every plan and sells
  point-in-time recovery as a switch. A bundled Postgres has neither until
  someone builds it (§2.1), and the volume in question holds the money ledger.
- **Patching.** Postgres and GoTrue CVEs become the server administrator's job
  the moment they run on your host. GoTrue is the authentication service.
- **It is already done.** The database was provisioned onto the client's own
  Supabase project and verified — 35 migrations, `verify-provision.sql` PASS on
  every check. Rebuilding it on the VPS discards proven work and re-opens the
  window in which a provisioning mistake goes unnoticed.

Nothing about the security model changes: RLS lives in the schema, so the
authorization boundary is identical wherever Postgres runs.

**The steps:**

1. **Keep** the Supabase project, its URL, anon key and service-role key.
2. **Fill `.env.docker`** from §3 and §3.1. Only the `APPLICATION VARS` block
   and `TUNNEL_TOKEN` are needed; everything marked `[BUNDLED-DB ONLY]` stays
   blank. Point `NEXT_PUBLIC_SUPABASE_URL` at the managed project.
3. **Set `TRUSTED_PROXY=cloudflare`** if the stack sits behind the tunnel. This
   is the one whose absence fails silently — see §3.1.
4. **Build on the host first.** The Dockerfile copies a prebuilt
   `.next/standalone` rather than running `next build`, so
   `npm ci && npm run build` before `docker compose build`.
5. **`docker compose up -d`**, then confirm `docker compose ps` lists
   `settle-cron` and `reconcile-cron`. Without them nobody is paid and no
   payment divergence is detected.
6. **Re-point the Stripe webhook** at the new domain and set the **new** signing
   secret. The secret is per endpoint; the old one will not verify.
7. **Update `APP_URL`** in the GitHub Actions secrets so the error digest polls
   the new host.
8. **Confirm `/api/health` reports `ok`**, with `geolocation` not degraded, and
   run the black-box suite against the live URL.
9. **Decommission the Vercel project** only once the VPS has served real traffic
   and both schedulers have been observed running.

**If you choose the bundled database anyway** (`--profile bundled-db`), add:
generate a matched `JWT_SECRET` / `ANON_KEY` / `SERVICE_ROLE_KEY` set plus
`POSTGRES_PASSWORD` and `SECRET_KEY_BASE`; apply the migrations and `npm run
seed` against it; make `verify-provision.sql` read PASS; ensure Postgres is not
reachable from the internet and the Studio dashboard is not exposed; and build
the backup procedure in §2.1 **before** the first real deposit.

The tunnel is worth stating plainly: the stack expects to sit behind
cloudflared, and `TRUSTED_PROXY=cloudflare` is what makes the app trust that
edge. If the client fronts it with their own nginx or exposes the origin
directly, that variable must **not** be set, and both rate limiting and
jurisdiction enforcement will need a different trusted-edge signal before the
platform can take money safely.

### 7.5 Checklists

**Managed Supabase + Vercel:**

- [ ] New Supabase project created in the client's organisation, `us-east-1`
- [ ] `npm run db:migrate` — 35 migrations applied
- [ ] `npm run seed` — `platform_settings` and teams present
- [ ] `scripts/verify-provision.sql` reads PASS on every check
- [ ] Vercel project owned by the client, all §3 variables set, redeployed
- [ ] Stripe webhook re-pointed at the new domain, new signing secret set
- [ ] GitHub repository transferred, Actions secrets re-added
- [ ] First admin created and enrolled in two-factor (§5)
- [ ] `/api/health` reports `ok`
- [ ] Both workflows run manually and their trigger steps report **success**, not
      *skipped*
- [ ] PITR enabled (§2)

**VPS hosting + managed Supabase** — the recommended shape (§7.4):

- [ ] Supabase project left in place; URL and both keys copied into `.env.docker`
- [ ] `.env.docker` complete per §3 and §3.1, **including `TRUSTED_PROXY`**
- [ ] Everything marked `[BUNDLED-DB ONLY]` left blank
- [ ] `npm ci && npm run build` on the host before `docker compose build`
- [ ] `docker compose ps` lists `settle-cron` **and** `reconcile-cron`
- [ ] Stripe webhook re-pointed at the new domain, new signing secret set
- [ ] `ALLOW_SANDBOX_PAYOUTS` removed once testing is finished
- [ ] First admin created and enrolled in two-factor (§5) — bootstrap returned
      **200**, not 503 or 409
- [ ] `/api/health` reports `ok`, with `geolocation` **not** degraded
- [ ] `alert.yml` Actions secret and `APP_URL` pointed at the VPS, run manually
- [ ] PITR enabled on the Supabase project (§2)
- [ ] Vercel project decommissioned only after the VPS has served real traffic
- [ ] *Bundled database only:* Postgres not internet-reachable, Studio not
      exposed, nightly dump running and **one restore rehearsed** (§2.1)
