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

| Unset `SETUP_SECRET` | Vercel env | Hygiene only, no longer a hole. `/api/seed-admin` now refuses with 410 once any admin exists, so a forgotten secret cannot reopen the bootstrap path |
| Function region | Vercel → Settings → Functions → Region → the region nearest the database (`pdx1` for `us-west-2`) | Functions default to `iad1` (Washington). A database on the opposite coast adds a cross-country round trip to every query, and purchase and settlement make several each. Match the region; a healthy database check should read tens of ms, not 200+ |
| MFA for admin accounts | Enrol at `/account/security` (TOTP) | **Built and enforced** — see §4. Every admin must enrol; payout approval, role changes and platform-fee edits refuse a session without a verified factor |
| PITR backups | Supabase dashboard | See §2 |

**Environment variables only apply to new deployments.** Vercel snapshots them at
deploy time, so adding one changes nothing until you redeploy. After setting any
row above: Deployments → latest → ⋯ → Redeploy.

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
   value on Vercel, then redeploy.
3. `POST /api/seed-admin` with `Authorization: Bearer $SETUP_SECRET`.
4. They enrol TOTP at `/account/security`. Until they do, they can sign in but
   cannot approve payouts or change roles.
5. Unset `SETUP_SECRET` and redeploy. Optional now — the endpoint answers 410
   once an admin exists — but it keeps the surface minimal.

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

### 7.4 Checklist

- [ ] New Supabase project created in the client's organisation, `us-east-1`
- [ ] `npm run db:migrate` — 35 migrations applied
- [ ] `npm run seed` — `platform_settings` and teams present
- [ ] Vercel project owned by the client, all §3 variables set, redeployed
- [ ] Stripe webhook re-pointed at the new domain, new signing secret set
- [ ] GitHub repository transferred, Actions secrets re-added
- [ ] First admin created and enrolled in two-factor (§5)
- [ ] `/api/health` reports `ok`
- [ ] Both workflows run manually and their trigger steps report **success**, not
      *skipped*

## 8. Deploying on a VPS instead of Vercel

Everything in §7 assumes the app stays on Vercel. It does not have to. The
application is a standard Next.js standalone server and `docker-compose.yml`
brings up the whole stack — app, Postgres, GoTrue, PostgREST, Realtime, Kong,
and an optional Cloudflare tunnel — on any host that runs Docker.

What follows is only the delta from §3 and §7. The database schema, the money
paths and the admin model are identical; nothing in §1, §2, §4, §5 or §6 changes
in substance.

**The one thing that will actually bite you** is scheduling. Read §8.1 before
anything else: two of the three scheduled jobs have no scheduler at all on a
self-hosted deployment, and both fail silently.

### 8.1 Scheduled jobs — the real gap

Nothing in this application schedules itself. Every scheduled job is an HTTP
endpoint that runs only when something calls it, and each one fails closed
(503) without `CRON_SECRET`. On Vercel three separate mechanisms do the calling.
On a VPS, `vercel.json` is inert — it is read by Vercel and by nothing else.

| Job | Endpoint | What calls it on Vercel | On a VPS |
|---|---|---|---|
| Settlement | `/api/cron/settle` | `vercel.json` daily + `settle-pools.yml` every 30 min | **Covered** — the `settle-cron` service in `docker-compose.yml`, every 15 min |
| Reconciliation | `/api/cron/reconcile` | `vercel.json` daily, 09:30 UTC | **NOTHING. You must add it.** |
| Error alert digest | `/api/cron/alert` | `alert.yml` every 2 hours | **NOTHING. You must add it.** |

Settlement is already handled: the compose stack ships a `settle-cron` sidecar
that calls the endpoint every 15 minutes, and the route is idempotent per pool,
so a repeated or overlapping call cannot pay a pool twice.

Reconciliation and alerting are not handled, and their absence is quiet in the
worst way. Reconciliation is the only thing that compares Stripe's records
against our ledger in both directions; without it, a player who was charged but
never credited stays invisible until they complain. The alert digest is the only
thing that reads `app_errors`; without it the table fills up and nobody looks.
Neither failure produces an error anywhere, because in both cases the failure is
that nothing ran.

Pick one of the three options below. Do not run two of them against the same
job.

**Option A — sidecars in `docker-compose.yml` (recommended).** Self-contained:
no dependency on GitHub, and the schedule lives with the deployment. Add these
two services alongside the existing `settle-cron`, which they deliberately
mirror:

```yaml
  reconcile-cron:
    container_name: sp-reconcile-cron
    image: alpine:3.20
    restart: unless-stopped
    depends_on:
      nextjs:
        condition: service_healthy
    environment:
      CRON_SECRET: ${CRON_SECRET}
    command: >
      sh -c 'apk add --no-cache curl >/dev/null 2>&1;
      while true; do
        code=$$(curl -s -o /tmp/out -w "%{http_code}" --max-time 300
                 -H "Authorization: Bearer $$CRON_SECRET"
                 http://nextjs:3000/api/cron/reconcile);
        echo "[reconcile-cron] $$(date -Iseconds) HTTP $$code";
        if [ "$$code" != "200" ]; then echo "[reconcile-cron] FAILED: $$(cat /tmp/out)"; fi;
        sleep 86400;
      done'
    networks:
      - default

  alert-cron:
    container_name: sp-alert-cron
    image: alpine:3.20
    restart: unless-stopped
    depends_on:
      nextjs:
        condition: service_healthy
    environment:
      CRON_SECRET: ${CRON_SECRET}
    command: >
      sh -c 'apk add --no-cache curl >/dev/null 2>&1;
      while true; do
        code=$$(curl -s -o /tmp/out -w "%{http_code}" --max-time 120
                 -H "Authorization: Bearer $$CRON_SECRET"
                 http://nextjs:3000/api/cron/alert);
        echo "[alert-cron] $$(date -Iseconds) HTTP $$code";
        if [ "$$code" != "200" ]; then echo "[alert-cron] FAILED: $$(cat /tmp/out)"; fi;
        sleep 7200;
      done'
    networks:
      - default
```

**Do not change those two `sleep` values without changing the route.** Each job
reads a fixed look-back window sized to its interval plus an overlap, so that a
boundary event is seen by two consecutive runs rather than none:

- `alert` — `LOOKBACK_MINUTES = 125` in `src/app/api/cron/alert/route.ts`,
  matching `sleep 7200` (2 hours) plus 5 minutes.
- `reconcile` — `LOOKBACK_HOURS = 49` in `src/app/api/cron/reconcile/route.ts`,
  which covers `sleep 86400` (daily) with a full extra day of margin, so one
  skipped run still does not lose records.

Widen the interval without widening the window and events fall between runs and
are never reported. That is a silent loss of exactly the records these jobs
exist to catch.

**Option B — keep the GitHub Actions workflows.** `settle-pools.yml` and
`alert.yml` are just authenticated `curl` calls; they do not care that the host
is no longer Vercel. To retarget them, set the `APP_URL` Actions secret to the
VPS domain — without it both default to the hard-coded
`https://sports-pool.vercel.app` and will keep polling the old deployment. Also
confirm the `CRON_SECRET` Actions secret matches the VPS value; when it is
missing, both workflows **skip and still report success**, which looks green
while nothing runs.

Option B still leaves reconciliation uncovered — there is no workflow for it —
so it needs the `reconcile-cron` sidecar or a host crontab entry regardless. If
you take Option B, also disable the `settle-cron` service or accept that
settlement is being driven twice; it is idempotent, so this is wasteful rather
than dangerous.

**Option C — a host crontab**, if you would rather not run sidecars:

```cron
*/15 * * * * curl -fsS -m 300 -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/settle    >/dev/null
15  */2 * * * curl -fsS -m 120 -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/alert     >/dev/null
30  9  * * *  curl -fsS -m 300 -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/reconcile >/dev/null
```

`crontab` does not read your shell profile, so put `CRON_SECRET=...` at the top
of the crontab itself or inline the value. A crontab that silently expands an
unset variable to the empty string sends `Authorization: Bearer ` and gets a
401 on every run, forever.

**Verify, do not assume.** After whichever option, confirm each job has actually
run — a scheduler you believe in but have never seen fire is the whole failure
mode this section is about:

```bash
docker compose logs --tail=20 sp-settle-cron sp-reconcile-cron sp-alert-cron
```

Each should show a line ending `HTTP 200`. A `503` means `CRON_SECRET` is unset
on the app; a `401` means the caller's value does not match the app's.

### 8.2 Environment variables

`.env.docker.example` is the template, not `.env.example` — it additionally
configures the self-hosted Supabase stack. Copy it to `.env.docker`, which
`docker-compose.yml` reads. Never commit the filled-in file.

Every row of the §3 table still applies, with these differences:

| §3 row | On a VPS |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Comes from the values you generate for the self-hosted stack (`SERVICE_ROLE_KEY` in `.env.docker`), not from a Supabase dashboard. Still bypasses every RLS policy; still must never be `NEXT_PUBLIC_` |
| `CRON_SECRET` | Required on the app, and required by whatever calls the endpoints per §8.1. If you kept the Actions workflows, it is still needed in **two** places and both values must match |
| `SETUP_SECRET` | **Still required.** It is not a Vercel feature — it gates the one-time admin bootstrap in the application itself. See §8.3 |
| `STRIPE_WEBHOOK_SECRET` | Re-point the Stripe endpoint at the VPS domain and take the **new** signing secret. The secret is per endpoint; the old one will not verify |
| Upstash Redis | Unchanged, but there is no Vercel Storage integration to auto-inject `KV_*`. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` by hand at console.upstash.com. Without them every rate limit is per-instance in memory |
| Function region | **Not applicable.** Instead, keep the app and the database on the same host or the same private network |
| PITR backups | **Not applicable, and this is a downgrade.** See §8.4 |

Set `SITE_URL`, `API_EXTERNAL_URL` and `NEXT_PUBLIC_APP_URL` to the real public
domain. Auth redirects, e-mail confirmation links and Stripe return URLs are all
built from these, so a stale `localhost:3000` breaks sign-up and checkout return
in ways that look like unrelated bugs.

**Environment changes need a restart, not a redeploy.** The Vercel note in §3
about redeploying does not apply; here it is `docker compose up -d` to recreate
the affected containers. Variables baked in at build time (`NEXT_PUBLIC_*`)
additionally need a rebuild — see §8.5.

### 8.3 Admin bootstrap

The §5 procedure is unchanged in substance, because it is application logic
rather than hosting. `/api/seed-admin` is the only way to create the first
admin: `src/instrumentation.ts` deliberately no longer promotes anyone on boot,
because doing so let whoever registered the `ADMIN_USER_EMAIL` address gain
admin by waiting for a restart.

Two mechanical differences on a VPS:

1. **Generate a fresh `SETUP_SECRET`.** It does not need to match the value on
   any existing deployment. It is a one-time password against this database, and
   a new deployment against a new database has nothing to match.
2. **Restart instead of redeploy** at steps 2 and 5 — `docker compose up -d`.

So, in full:

```bash
# 1. The admin signs up normally through /signup first.
# 2. Set ADMIN_USER_EMAIL and a generated SETUP_SECRET in .env.docker, then:
docker compose up -d
# 3. Run the one-time bootstrap:
curl -X POST https://<domain>/api/seed-admin -H "Authorization: Bearer $SETUP_SECRET"
# 4. They enrol TOTP at /account/security — until then they cannot approve payouts.
# 5. Remove SETUP_SECRET from .env.docker and restart again.
```

Step 5 is hygiene rather than a fix: the endpoint answers `410` once any admin
exists, so a forgotten secret cannot reopen the path.

### 8.4 Backups are now your job

This is the largest thing the move costs you, and it is easy to miss because
nothing announces it.

On Supabase, §2 leans on managed backups and Point-in-Time Recovery. A
self-hosted Postgres in `docker-compose.yml` has neither. It has a bind mount at
`./volumes/db/data` and no backup of any kind. Nothing in the compose stack will
ever produce one.

This system holds player balances and an append-only money ledger. Neither can
be reconstructed from anywhere else. So before taking a single real payment, set
up a scheduled `pg_dump` off the host:

```bash
docker compose exec -T db pg_dump -U postgres postgres | gzip > sp-$(date +%F).sql.gz
```

Store copies off the machine — a backup on the same VPS is a copy of the disk
you are protecting against, not a backup. The §2 restore drill matters more
here, not less: with managed PITR you are trusting a vendor who tests recovery,
and with this you are trusting yourself, who has not yet.

### 8.5 Build and deploy

**The Dockerfile does not build the app.** It copies a prebuilt
`.next/standalone`, so the build happens on the host first. Deploying a change
means:

```bash
npm ci && npm run build
docker compose build
docker compose up -d
```

Skipping `npm run build` silently ships the previous build — `docker compose
build` succeeds, the containers restart, and the change is simply not there.

### 8.6 Checklist

- [ ] `.env.docker` filled in from `.env.docker.example`, not committed
- [ ] `SITE_URL`, `API_EXTERNAL_URL`, `NEXT_PUBLIC_APP_URL` all set to the real domain
- [ ] `CRON_SECRET` set, and set for whatever calls the endpoints (§8.1)
- [ ] `reconcile-cron` and `alert-cron` added, or Option B/C configured (§8.1)
- [ ] All three cron callers observed returning **HTTP 200** in the logs
- [ ] Stripe webhook re-pointed at the VPS domain, **new** signing secret set
- [ ] Upstash credentials set by hand (no Vercel integration to inject them)
- [ ] First admin created via `/api/seed-admin` and enrolled in TOTP (§8.3)
- [ ] `SETUP_SECRET` removed after bootstrap
- [ ] Scheduled `pg_dump` running and shipping off the host (§8.4)
- [ ] One backup restored into a scratch database and verified (§2)
- [ ] `curl -s -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/health` reports `ok`
- [ ] GitHub Actions workflows either retargeted via `APP_URL` or disabled, not left polling the old Vercel domain
