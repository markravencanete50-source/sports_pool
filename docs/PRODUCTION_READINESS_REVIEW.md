# SportsPool production-readiness review

Date: 2026-09-08 (Asia/Singapore)
Revision: `bdb2a8e4bd58a514eb7352d1b84d95a42d42f763`

## Verified

- `npm audit --json`: 0 vulnerabilities across 673 dependencies.
- `npm run check`: passed typecheck, migration checks (38 migrations), cron checks (2 crons), documentation checks, 91 unit tests, settlement checks including 243 payout-rounding combinations, and lint with no errors.
- Production browser suite against `https://www.playsportspool.com`: 57 passed and 13 intentionally skipped. Desktop and mobile coverage included public rendering, console/page errors, signup validation and visible error dialogs, age gate, keyboard operation, accessible names, tap targets, overflow, and anonymous protected-route redirects.
- GitHub CI, post-deploy verification, pool settlement, and error-alert workflows passed for this revision.
- Client Vercel production deployment is Ready.
- PayPal production environment variables are present in the client Vercel project; `ALLOW_SANDBOX_PAYOUTS` is not present there. The PayPal secret was not changed.

## Code and security review

The current implementation includes server-side authoritative pool pricing, authenticated ownership checks for payment confirmation, Stripe webhook signature verification and idempotent fulfillment, same-origin protection for state-changing routes, rate limiting, fail-closed cron/admin shared-secret guards, service-role isolation, and migration-level protections for money-table writes and RLS.

## Not executed

No real Stripe charge, PayPal payout, or destructive production-data test was executed. The repository browser suite deliberately skips authenticated purchase, withdrawal, and settlement journeys because those require isolated funded accounts and provider test-mode credentials. The local money preflight could not exercise PayPal because the local environment does not contain PayPal credentials and could not reach Supabase from that shell; this does not change the client Vercel configuration.

## Handover blockers

Before enabling real-money traffic, run a controlled Stripe test checkout/webhook delivery and a PayPal sandbox or approved live payout with isolated accounts, then reconcile the resulting transaction, balance, card, withdrawal, and provider records. Confirm Stripe live keys and the production webhook endpoint/signing secret independently. Do not certify payment readiness from the static checks alone.

No `robots.txt` change was made.

## Follow-up verification

- Created the isolated Supabase preview branch `sports-pool-payment-test` (project ref `zayaxfofsnfldfcaeggn`); production was not changed. The branch reached Healthy status, although its dashboard later reported a transient database-process health alert while provisioning.
- Resend dashboard reports `houseoflettings.uk` as Verified. One authorized, non-transactional delivery test to the project owner's Gmail was attempted; Resend rejected it with HTTP 403 because the API key is not authorized to send from that domain. No retry or live email configuration change was made.
- PayPal sandbox testing was intentionally excluded, as requested. No live payout was attempted.
