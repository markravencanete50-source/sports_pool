import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
];

/** Signed-in AND role=admin. */
const ADMIN_PATHS = ["/admin"];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options?: any }>
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
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

  const needsAuth = matches(PROTECTED_PATHS);
  const needsAdmin = matches(ADMIN_PATHS);

  if ((needsAuth || needsAdmin) && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (needsAdmin) {
    // Read the role from the JWT app_metadata so this costs no DB round-trip.
    // seedAdminUser() writes app_metadata.role, and the admin APIs re-verify
    // against the users table, so a stale claim cannot grant real access.
    const role = (user?.app_metadata as Record<string, unknown> | undefined)?.role;
    if (role !== "admin") {
      // 404 rather than 403: do not confirm the admin surface exists.
      return NextResponse.rewrite(new URL("/not-found", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
