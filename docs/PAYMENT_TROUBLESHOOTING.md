# Card-payment diagnosis and activation

Production Checkout requires a live Stripe secret/restricted key. Test keys are
accepted only outside the Vercel production environment. A configuration error
is shown before redirecting the customer to Stripe; health reports degraded
until production is configured for live payments.

## If every real card is declined

Run `npm run diagnose:payments` in a trusted environment containing the deployed
environment variables. This command reads the Stripe account, recent payment
status/decline counts, webhook destinations, and ledger integrity. It never
creates payments or prints API keys or customer/card details. Its account ID
and name must match the client's intended merchant account.

`test_mode_live_card` means a real card reached a test-mode checkout. Look in the
account's sandbox/test dashboard for these attempts. Setting up Stripe Connect
does not resolve this configuration error: this app uses ordinary hosted Stripe
Checkout on the configured merchant account.

## Production activation

1. The account owner must activate the correct SportsPool merchant account and
   complete Stripe's business verification. Confirm that card payments are enabled.
2. In Vercel Production, set `STRIPE_SECRET_KEY` to that account's live secret or
   restricted key, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to its live publishable
   key. Use Vercel's secret fields; do not put keys into source control or chat.
3. In that same live Stripe account, configure `checkout.session.completed` to
   `https://www.playsportspool.com/api/stripe/webhook`. Use the final `www` URL:
   the bare domain redirects, and Stripe treats webhook redirects as failures.
4. Set `STRIPE_WEBHOOK_SECRET` to that endpoint's signing secret, then redeploy.
5. Run diagnostics again, confirm the intended live account and direct webhook
   destination, and verify a signed delivery. The account owner should complete
   the final real-payment acceptance check. Never use real cards as test data.

## Recovery and duplicate protection

Browser confirmation and webhook delivery use `fulfillCardPurchase`. Database
read/write failures return 5xx so Stripe retries. Permanent fulfilment failures
are recorded for operator review; they are not reported as fulfilled. A database
uniqueness conflict is successful only if the transaction for the exact Checkout
Session can be found. Repeated callbacks return the already-created card.

Database constraints on session IDs, payment IDs, and card slots remain required.
Use `npm run check` for the regression suite and settlement invariants, then run
`E2E_BASE_URL=https://www.playsportspool.com npm run test:e2e` against production.

References: [Stripe testing](https://docs.stripe.com/testing),
[Stripe webhook delivery errors](https://docs.stripe.com/webhooks#debug-webhook-integrations).
