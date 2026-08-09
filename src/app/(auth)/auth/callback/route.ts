import { createClient } from "@/lib/supabase/server";
import { DASHBOARD_PATH } from "@/lib/routes";
import { NextResponse } from "next/server";

/**
 * SECURITY — open redirect.
 *
 * `next` used to be taken from the query string and passed straight to
 * `new URL(next, request.url)`. An absolute value such as
 * `?next=https://evil.com` (or a scheme-relative `//evil.com`) resolves to an
 * off-site origin, so the post-login redirect landed the freshly authenticated
 * user on an attacker-controlled page — a phishing primitive on a trusted
 * domain, and a lever for OAuth token/code relay in redirect-based flows.
 *
 * `next` is now accepted only as a same-origin, path-relative destination:
 * it must start with a single "/" and must not start with "//" or "/\", which
 * are the forms a browser treats as protocol-relative external URLs. Anything
 * else falls back to the dashboard. The final URL is still built against the
 * request origin, and we assert the resolved origin matches before redirecting.
 */
function safeNextPath(raw: string | null): string {
  if (!raw) return DASHBOARD_PATH;
  // Must be a path on our own site: single leading slash, not "//" or "/\".
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return DASHBOARD_PATH;
  }
  return raw;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` arrives via Supabase's redirect_to, i.e. attacker-influenceable.
  const nextPath = safeNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", request.url)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  const requestUrl = new URL(request.url);
  const url = new URL(nextPath, requestUrl.origin);

  // Defence in depth: never redirect off the request origin, whatever `next`
  // resolved to.
  if (url.origin !== requestUrl.origin) {
    return NextResponse.redirect(new URL(DASHBOARD_PATH, requestUrl.origin));
  }

  url.searchParams.set("verified", "1");
  return NextResponse.redirect(url);
}
