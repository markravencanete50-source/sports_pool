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
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | console.upstash.com → create Redis DB → Vercel env vars (all environments) | Without them every rate limit is per-instance in-memory — the sign-in throttle multiplies by the number of warm instances |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Webhooks → the production endpoint (`/api/stripe/webhook`, event `checkout.session.completed`) | Wrong or unset secret = users charged with no card issued. Unset is verifiable from outside: the webhook answers `503 {"error":"Webhook not configured"}` instead of `400 Missing stripe-signature` |
| `PAYPAL_MODE=live` + production client id/secret | Vercel env | The code fails closed to "not configured", so payouts simply won't send until this is right |
| `CRON_SECRET` | **Two places.** Vercel env, **and** GitHub → Settings → Secrets and variables → Actions | Vercel: settlement, reconciliation and the alert digest answer 503 until set. GitHub: without the Actions secret `settle-pools.yml` and `alert.yml` **skip and still report success** — a green workflow doing nothing. Both values must match. Verify by running either workflow manually and confirming its trigger step says success, not skipped |

| Unset `SETUP_SECRET` | Vercel env | Hygiene only, no longer a hole. `/api/seed-admin` now refuses with 410 once any admin exists, so a forgotten secret cannot reopen the bootstrap path |
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
