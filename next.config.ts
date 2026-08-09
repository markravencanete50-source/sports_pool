import type { NextConfig } from "next";

/**
 * Static security headers.
 *
 * The app shipped with none at all, which matters more than usual here: the
 * admin payout-approval screen and the user withdrawal flow are both
 * state-changing UIs reachable with a session cookie, so without
 * frame-ancestors / X-Frame-Options they can be framed and clickjacked into
 * approving or requesting a payout.
 *
 * THE CSP IS NOT HERE — see src/lib/csp.ts and src/proxy.ts.
 *
 * It carries a per-request nonce so that script-src no longer needs
 * 'unsafe-inline', and a nonce cannot be emitted from this file because
 * headers() is evaluated once at build time. Only the headers whose values are
 * genuinely static remain below.
 */

const securityHeaders = [
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
