/**
 * Cookie options for every server-side Supabase client.
 *
 * @supabase/ssr's defaults are { path, sameSite: 'lax', httpOnly: false,
 * maxAge: 400 days } with no `secure` flag, so the session cookie was being sent
 * over plain HTTP if a request ever reached the app that way.
 *
 * httpOnly is now TRUE.
 *
 * It used to be false so the browser Supabase client could read the session out
 * of document.cookie to authenticate its realtime subscription. The cost of that
 * was severe for a real-money product: the cookie holds the REFRESH token, so
 * any XSS — one bad dependency, one injected script — could exfiltrate it and
 * mint fresh access tokens indefinitely, long after the user closed the tab or
 * changed their password. That is permanent account takeover, including the
 * ability to move money, and it made the CSP the only thing standing in the way.
 *
 * Realtime no longer needs the cookie. It has its own auth path
 * (src/lib/supabase/realtime-client.ts + /api/auth/realtime-token) which hands
 * the browser ONLY a short-lived access token, never the refresh token. XSS can
 * still call that endpoint, but what it gets expires in about an hour and cannot
 * be renewed — a bounded incident instead of a permanent one.
 *
 * Do NOT set this back to false. The browser must never see the refresh token.
 */
export const SUPABASE_COOKIE_OPTIONS = {
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  httpOnly: true,
} as const;
