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

| Item | Where | Why |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | console.upstash.com → create Redis DB → Vercel env vars (all environments) | Without them every rate limit is per-instance in-memory — the sign-in throttle multiplies by the number of warm instances |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Webhooks → the production endpoint | Wrong secret = users charged with no card issued |
| `PAYPAL_MODE=live` + production client id/secret | Vercel env | The code fails closed to "not configured", so payouts simply won't send until this is right |
| `CRON_SECRET` | Vercel env | Settlement and reconciliation answer 503 until set |
| Unset `SETUP_SECRET` | Vercel env | Bootstrap endpoint should die after the first admin exists |
| MFA for admin accounts | Supabase Auth (TOTP) + enforcement in `requireAdmin` | An admin credential alone can currently move money — see §4 |
| PITR backups | Supabase dashboard | See §2 |

## 4. Known-open items (by design or pending external action)

- **Admin MFA (audit BE-4)** is not implemented in-app. Do not half-ship it:
  enforcement without an enrollment flow locks every admin out. The
  implementation seam is `src/lib/require-admin.ts` (require `aal2` once a
  verified TOTP factor exists) plus an enrollment page using
  `supabase.auth.mfa` server-side. Until then, admin accounts must use
  20+ character generated passwords stored in a password manager.
- **E2E money-path test (BE-10)**: requires real Stripe test-mode keys;
  procedure sketch lives in the audit document §9.A. Run it before the first
  real deposit.
- **External uptime monitoring / alerting (OPS-2 residual)**: `app_errors`
  and structured logs exist; pointing an alert at them (Vercel log drains,
  or a scheduled Supabase query) still needs an external destination chosen.
