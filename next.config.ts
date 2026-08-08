import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * The app shipped with none at all, which matters more than usual here: the
 * admin payout-approval screen and the user withdrawal flow are both
 * state-changing UIs reachable with a session cookie, so without
 * frame-ancestors / X-Frame-Options they can be framed and clickjacked into
 * approving or requesting a payout.
 *
 * CSP notes:
 *  - 'unsafe-inline' on style-src is required by Tailwind's runtime style
 *    injection and by the inline styles in the design preview.
 *  - script-src: 'unsafe-eval' is dev-only, but 'unsafe-inline' is present in
 *    PRODUCTION TOO, because Next.js injects inline bootstrap/hydration scripts.
 *
 *    KNOWN LIMITATION — do not read more into this header than it delivers:
 *    with 'unsafe-inline' present, script-src provides essentially NO XSS
 *    mitigation, since an injected inline script would execute. It still
 *    constrains which EXTERNAL origins may load scripts, and the other
 *    directives (frame-ancestors, form-action, object-src, base-uri) are doing
 *    real work.
 *
 *    The fix is a per-request nonce: generate one in src/proxy.ts, pass it
 *    through, and emit "'nonce-<value>' 'strict-dynamic'" instead of
 *    'unsafe-inline'. That needs verifying in a real browser — a wrong nonce
 *    breaks hydration and takes the whole app down — so it is tracked in the
 *    handover checklist rather than changed blind.
 *  - connect-src must list every external origin the browser talks to. Adding a
 *    new provider (a second payout rail, an analytics vendor) means adding it
 *    here or the request is blocked.
 */
const isProd = process.env.NODE_ENV === "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://js.stripe.com`,
  // src/app/font-loader.tsx injects a Google Fonts stylesheet at runtime and the
  // faces are served from gstatic. Both origins must be allowed or the app
  // silently loses its typography — CSP failures do not throw, they just drop
  // the resource.
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

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Everything except the Stripe webhook, which is a server-to-server
        // POST and gets no benefit from browser headers.
        source: "/((?!api/stripe/webhook).*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
