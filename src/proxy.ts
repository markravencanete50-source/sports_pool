import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { buildCsp, generateNonce } from "@/lib/csp";
import { resolveGeo } from "@/lib/compliance/geo";

/**
 * Route protection. In Next.js 16 this file is `proxy.ts` (formerly `middleware.ts`).
 *
 * SECURITY NOTE: this is defence-in-depth, NOT the authorization boundary.
 * Every API route must still enforce its own auth/ownership server-side, because
 * the matcher below can be bypassed by calling route handlers directly in some
 * deployment topologies. See src/lib/require-admin.ts.
 */

/** Signed-in users only. */
const PROTECTED_PATHS = [
  "/create-pool",
  "/private-pools",
  "/invitations",
  "/my-games",
  // --- added: these were reachable by anonymous visitors in production ---
  "/dashboard",
  "/winnings",
  // Every /account surface (profile, security, close) is personal and its
  // APIs all answer 401 anonymously. Without this an anonymous visitor gets a
  // rendered page that then fails to load itself, which reads as a broken site
  // rather than as "sign in first".
  "/account",
];

/** Signed-in AND role=admin. */
const ADMIN_PATHS = ["/admin"];

/**
 * Paths where a paid contest is actually reachable, for geo-restriction.
 *
 * This is the OUTER layer of jurisdiction control and deliberately the weaker
 * one: it keeps players in prohibited territories from wandering into the paid
 * product, which is a courtesy and a licensing signal. It is NOT what protects
 * the money — every money route independently calls assertCompliance(), which
 * re-resolves the jurisdiction server-side. Someone who defeats this still
 * cannot buy a card.
 *
 * The two layers have opposite failure postures on purpose. Here, over-blocking
 * is expensive (a legitimate visitor hits a wall), so an unknown location passes
 * through. At the money boundary, under-blocking is expensive (an unlicensed
 * wager), so an unknown location fails closed. Neither posture is right in both
 * places.
 */
const GEO_RESTRICTED_PATHS = [
  "/dashboard",
  "/public-pools",
  "/private-pools",
  "/create-pool",
  "/pool",
  "/my-games",
  "/winnings",
  "/invitations",
];

/**
 * Blocked territories as "US-WA,US-NV,GB" — country, or country-region.
 *
 * A cache of jurisdiction_rules, not a second source of truth: the edge cannot
 * afford a database round trip per request. When unset this layer is inert,
 * which is the correct default — it fails OPEN here precisely because the money
 * boundary fails CLOSED.
 */
function geoBlocklist(): Set<string> {
  const raw = process.env.COMPLIANCE_BLOCKED_REGIONS?.trim();
  if (!raw) return new Set();
  return new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
}

function isGeoBlocked(request: NextRequest): boolean {
  const blocklist = geoBlocklist();
  if (blocklist.size === 0) return false;

  // resolveGeo() only honours headers behind an edge that overwrites them
  // (Vercel, or a Cloudflare tunnel declared via TRUSTED_PROXY=cloudflare).
  // Anywhere else they are attacker-controlled and geo comes back untrusted,
  // which fails open here — the money boundary is what fails closed.
  const geo = resolveGeo(request.headers);
  if (!geo.trusted || !geo.country) return false;

  return (
    blocklist.has(geo.country) ||
    (geo.region !== null && blocklist.has(`${geo.country}-${geo.region}`))
  );
}

export async function proxy(request: NextRequest) {
  /*
   * Per-request CSP nonce.
   *
   * Setting the nonce on the REQUEST's Content-Security-Policy header is what
   * makes this work: Next.js reads it there and stamps the same nonce onto
   * every script tag it renders, so its inline bootstrap is authorised without
   * 'unsafe-inline'. The header is also set on the response, which is what the
   * browser actually enforces.
   *
   * API routes are skipped — CSP governs documents, and the Stripe webhook in
   * particular is a server-to-server POST that gains nothing from it.
   */
  const isDocumentRequest = !request.nextUrl.pathname.startsWith("/api/");
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  if (isDocumentRequest) {
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("content-security-policy", csp);
  }

  const withCsp = <T extends NextResponse>(res: T): T => {
    if (isDocumentRequest) res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SUPABASE_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const matches = (paths: string[]) =>
    paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (matches(GEO_RESTRICTED_PATHS) && isGeoBlocked(request)) {
    // Rewrite rather than redirect: the URL stays put, so a shared link does
    // not turn into an explanation page for everyone who follows it.
    return withCsp(
      NextResponse.rewrite(new URL("/unavailable", request.url), {
        request: { headers: requestHeaders },
      })
    );
  }

  const needsAuth = matches(PROTECTED_PATHS);
  const needsAdmin = matches(ADMIN_PATHS);

  if ((needsAuth || needsAdmin) && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    return withCsp(NextResponse.redirect(redirectUrl));
  }

  if (needsAdmin) {
    // Read the role from the JWT app_metadata so this costs no DB round-trip.
    // seedAdminUser() writes app_metadata.role, and the admin APIs re-verify
    // against the users table, so a stale claim cannot grant real access.
    const role = (user?.app_metadata as Record<string, unknown> | undefined)?.role;
    if (role !== "admin") {
      // 404 rather than 403: do not confirm the admin surface exists.
      return withCsp(
        NextResponse.rewrite(new URL("/not-found", request.url), {
          request: { headers: requestHeaders },
        })
      );
    }
  }

  return withCsp(supabaseResponse);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
