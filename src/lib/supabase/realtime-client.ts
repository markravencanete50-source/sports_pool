"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Realtime-only Supabase client for the browser.
 *
 * This replaces the old cookie-reading browser client. The session cookie is now
 * httpOnly, so nothing in the browser can read the session — deliberately, since
 * that cookie holds the refresh token. Realtime still needs a JWT so the server
 * can evaluate RLS per subscriber (the comments policy is card-holder-only), so
 * this client fetches a SHORT-LIVED ACCESS TOKEN from /api/auth/realtime-token.
 *
 * supabase-js calls the `accessToken` callback itself whenever it needs to
 * authenticate the socket, including on reconnects, so a page left open past the
 * token's lifetime keeps working: the callback simply mints a fresh one. That is
 * why this is wired as a callback rather than a token captured once at startup.
 *
 * NOTE: with `accessToken` set, supabase-js disables its `auth` namespace and
 * throws on `client.auth.*`. That is correct here — authentication happens on
 * the server through the /api/auth/* routes, and this client exists purely to
 * carry realtime subscriptions.
 */

/** Renew this far ahead of expiry so a subscription never uses a dead token. */
const REFRESH_SKEW_MS = 60_000;

/** Used only when the server does not report an expiry; deliberately short. */
const FALLBACK_TTL_MS = 5 * 60_000;

let cachedToken: { token: string; expiresAtMs: number } | null = null;
let inFlight: Promise<string | null> | null = null;

async function requestToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/realtime-token", {
      credentials: "include",
      cache: "no-store",
    });

    if (!res.ok) {
      // 401 is normal and expected: signed-out visitors still render pages that
      // mount a subscription. Drop the token and let realtime stay anonymous —
      // RLS then returns nothing, which is the correct outcome, not an error.
      cachedToken = null;
      return null;
    }

    const data: unknown = await res.json();
    const token = (data as { token?: unknown })?.token;
    if (typeof token !== "string" || token.length === 0) {
      cachedToken = null;
      return null;
    }

    const expiresAt = (data as { expiresAt?: unknown })?.expiresAt;
    const expiresAtMs =
      typeof expiresAt === "number" && Number.isFinite(expiresAt)
        ? expiresAt * 1000
        : Date.now() + FALLBACK_TTL_MS;

    cachedToken = { token, expiresAtMs };
    return token;
  } catch {
    // Offline or a transient failure: never throw into supabase-js's auth path.
    cachedToken = null;
    return null;
  }
}

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAtMs - REFRESH_SKEW_MS) {
    return cachedToken.token;
  }
  // Collapse concurrent misses onto one request, so mounting several
  // subscriptions at once does not fan out into several token fetches.
  if (!inFlight) {
    inFlight = requestToken().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/**
 * Drop the cached token. Call on sign-out so the next subscription cannot keep
 * using the previous user's token from memory.
 */
export function clearRealtimeToken(): void {
  cachedToken = null;
  inFlight = null;
}

let client: SupabaseClient | null = null;

/**
 * Shared realtime client. A single instance means one websocket for the whole
 * app rather than one per mounted subscription.
 */
export function getRealtimeClient(): SupabaseClient {
  if (client) return client;

  client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { accessToken: getAccessToken }
  );

  return client;
}
