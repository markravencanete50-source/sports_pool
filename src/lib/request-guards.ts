import { NextResponse } from "next/server";

/**
 * CSRF defence for state-changing API routes.
 *
 * Session auth is cookie-based (Supabase SSR). SameSite=Lax already stops a
 * cross-site form from sending the session cookie on a POST, but that is a
 * single control living in cookie configuration. This adds an independent,
 * explicit check at the routes that move money or change payout details, so a
 * misconfiguration in one layer is not enough on its own.
 *
 * How it behaves:
 *   - Browsers always attach an `Origin` header to POST/PUT/PATCH/DELETE. If the
 *     Origin's host is not our own host (or the configured app URL), the request
 *     is a cross-site call and is refused.
 *   - Requests with NO Origin header (server-to-server, curl, some native
 *     clients) are allowed through: they are not browser-driven CSRF, and
 *     SameSite still governs any cookie they carry. Blocking them would break
 *     legitimate non-browser callers without adding CSRF protection.
 *
 * Do NOT use this on the Stripe webhook (no Origin, authenticated by signature)
 * or on GET routes.
 */
export function assertSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null; // non-browser caller; not a CSRF vector

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json({ error: "Invalid Origin header" }, { status: 403 });
  }

  const allowed = new Set<string>();

  const host = request.headers.get("host");
  if (host) allowed.add(host);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).host);
    } catch {
      // Ignore a malformed configured URL; the Host header is the primary match.
    }
  }

  if (!allowed.has(originHost)) {
    return NextResponse.json(
      { error: "Cross-origin request refused" },
      { status: 403 }
    );
  }

  return null;
}
