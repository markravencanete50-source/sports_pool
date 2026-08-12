import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Mints a short-lived access token for the browser's realtime subscription.
 *
 * WHY THIS EXISTS
 *
 * The session cookie is httpOnly (see supabase/cookie-options.ts), so the
 * browser can no longer read the session itself — which is the point: the cookie
 * carries the REFRESH token, and a refresh token in reach of XSS is permanent
 * account takeover. Realtime still needs a JWT to evaluate RLS per subscriber
 * (the comments policy is card-holder-only), so it gets one from here instead.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It returns ONLY session.access_token — never the refresh token. That is the
 * whole security argument for this endpoint. An attacker with XSS can call it
 * (it is same-origin and cookie-authenticated, so anything running on the page
 * can), but all they obtain is a bearer token that dies with the session, on the
 * order of an hour, and cannot be renewed once it lapses. Handing back the
 * refresh token here would rebuild the exact hole httpOnly just closed.
 *
 * The token is no more powerful than the caller's own session — it IS their
 * session's access token — so this grants the page nothing it could not already
 * do by calling our own API routes with its cookie.
 */

// Per-user output that must never be cached or shared between users.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = await createClient();

    // getUser() validates the JWT against the auth server. getSession() alone
    // only decodes whatever is in the cookie, so it is not sufficient to
    // authenticate the caller before handing out a token.
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      {
        token: session.access_token,
        // Unix seconds; the client refreshes ahead of this.
        expiresAt: session.expires_at ?? null,
      },
      {
        status: 200,
        headers: {
          // A bearer token must not sit in any shared or browser cache.
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    console.error(
      "[realtime-token]",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
