/**
 * Content Security Policy, built per request so it can carry a nonce.
 *
 * WHY THIS MOVED OUT OF next.config.ts
 *
 * A nonce must be unique per response, and next.config.ts `headers()` emits a
 * single static header at build time. So the CSP is now assembled here and set
 * by src/proxy.ts on every HTML response. The non-CSP security headers
 * (X-Frame-Options, HSTS, nosniff, Referrer-Policy, Permissions-Policy) are
 * static and stay in next.config.ts.
 *
 * WHAT CHANGED, AND WHY IT MATTERS
 *
 * script-src previously carried 'unsafe-inline' in production. The comment
 * claimed it was dev-only; it was not. With 'unsafe-inline' present, script-src
 * provides essentially no XSS mitigation, because an injected inline script
 * executes like any other. It was there because Next.js emits inline
 * bootstrap/hydration scripts.
 *
 * Those inline scripts are now authorised by a nonce instead. Next.js reads the
 * nonce out of the request's Content-Security-Policy header and stamps it onto
 * every script tag it generates, so the inline bootstrap keeps working while
 * arbitrary injected script does not.
 *
 * NOTE ON 'strict-dynamic'
 *
 * Deliberately NOT used. Under strict-dynamic browsers ignore 'self' and every
 * host allowlist, trusting only scripts loaded by an already-trusted script.
 * That is stricter, but it makes the policy brittle: anything loading a script
 * outside the Next.js bundle graph breaks with no warning. Nonce + explicit
 * allowlist removes the actual finding ('unsafe-inline') while keeping the
 * failure mode obvious. Tighten to strict-dynamic later if desired, but verify
 * Stripe.js still loads.
 */

const isProd = process.env.NODE_ENV === "production";

export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // 'unsafe-inline' is GONE. The nonce authorises Next's inline bootstrap.
    // 'unsafe-eval' remains dev-only — React Refresh needs it.
    `script-src 'self' 'nonce-${nonce}'${isProd ? "" : " 'unsafe-eval'"} https://js.stripe.com`,
    // Styles keep 'unsafe-inline': Tailwind injects style attributes/tags at
    // runtime and there is no nonce path for those. Inline STYLE is a far
    // weaker vector than inline SCRIPT — it cannot execute JavaScript.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://*.supabase.co https://a.espncdn.com https://*.espncdn.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    [
      "connect-src 'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://api.stripe.com",
      "https://site.api.espn.com",
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ].join(" "),
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Cryptographically random, base64, fresh for every request. */
export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
