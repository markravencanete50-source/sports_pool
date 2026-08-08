/**
 * Cookie options for every server-side Supabase client.
 *
 * @supabase/ssr's defaults are { path, sameSite: 'lax', httpOnly: false,
 * maxAge: 400 days } with no `secure` flag, so the session cookie was being sent
 * over plain HTTP if a request ever reached the app that way.
 *
 * httpOnly stays FALSE deliberately: src/lib/hooks/use-pools.ts drives realtime
 * subscriptions through the browser Supabase client, which reads this cookie
 * from JavaScript. Setting httpOnly here silently breaks realtime — it needs a
 * separate auth path before that flag can be turned on.
 */
export const SUPABASE_COOKIE_OPTIONS = {
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
} as const;
