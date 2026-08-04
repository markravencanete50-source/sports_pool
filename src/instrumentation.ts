/**
 * Next.js instrumentation hook — runs once per server start.
 *
 * SECURITY: this used to call seedAdminUser() unconditionally on every boot,
 * silently promoting whatever account matches ADMIN_USER_EMAIL to admin using
 * the service-role key.
 *
 * That made the SETUP_SECRET gate on /api/seed-admin meaningless: an attacker
 * who registered the ADMIN_USER_EMAIL address did not need to call the endpoint
 * at all, they just had to wait for the next cold start — which on serverless
 * is minutes, not months. Privilege escalation on a timer.
 *
 * Admin bootstrap is now an explicit, authenticated, one-time operation:
 *   curl -X POST https://<host>/api/seed-admin -H "Authorization: Bearer $SETUP_SECRET"
 * Unset SETUP_SECRET afterwards so the endpoint fails closed again.
 */
export async function register() {
  // Intentionally empty. Do not reintroduce privileged writes here — code in
  // this hook runs with no request context, no caller identity and no audit
  // trail, which makes it the wrong place for any authorization-bearing action.
}
