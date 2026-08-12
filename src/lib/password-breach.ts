import { createHash } from "crypto";

/**
 * Breached-password screening via the HaveIBeenPwned range API.
 *
 * WHY THIS EXISTS AT THE APPLICATION LAYER
 *
 * Supabase Auth has this built in ("leaked password protection"), but it is
 * gated to paid plans, so on the current plan nothing stops a user from
 * registering with a password that appears in public breach dumps — on an
 * account that holds a cash balance. This module closes that gap without a
 * plan change. If the project later moves to a plan with the native check,
 * this stays harmless (two layers agree) and can then be removed.
 *
 * PRIVACY — THE PASSWORD NEVER LEAVES THE SERVER
 *
 * The range API uses k-anonymity: we send only the FIRST FIVE hex characters
 * of the SHA-1 of the password. The response is every known-breached hash
 * suffix sharing that prefix (several hundred), and the comparison happens
 * here. HIBP never sees the password, its full hash, or anything correlating
 * the query to a user. See https://haveibeenpwned.com/API/v3#PwnedPasswords
 *
 * FAILURE POSTURE — FAIL OPEN, ON PURPOSE
 *
 * If HIBP is unreachable or slow, signup proceeds without the check. Blocking
 * every registration because a third-party API is down is a worse outcome
 * than admitting a weak password during the outage; the zod policy (10+ chars,
 * mixed case, digit) still applies unconditionally. The timeout is short so a
 * degraded HIBP cannot hold the signup request hostage.
 *
 * SHA-1 is what the HIBP corpus is keyed by; its weakness as a password hash
 * is irrelevant here — this is a lookup key, not storage.
 */

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 2500;

export type BreachCheckResult =
  | { checked: true; breached: boolean; count: number }
  | { checked: false; breached: false; count: 0 };

export async function checkPasswordBreached(
  password: string
): Promise<BreachCheckResult> {
  try {
    const sha1 = createHash("sha1")
      .update(password, "utf8")
      .digest("hex")
      .toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const res = await fetch(HIBP_RANGE_URL + prefix, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // Padding makes every response the same shape, so a network observer
        // cannot infer anything from the response size either.
        "Add-Padding": "true",
        "User-Agent": "sports-pool-signup-check",
      },
      // Never cache a security decision at the fetch layer.
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[password-breach] HIBP returned", res.status);
      return { checked: false, breached: false, count: 0 };
    }

    const text = await res.text();
    for (const line of text.split("\n")) {
      const [candidate, countStr] = line.trim().split(":");
      if (candidate === suffix) {
        const count = Number.parseInt(countStr ?? "0", 10) || 0;
        // Padded responses include real entries with count 0 — those are the
        // padding, not a breach.
        if (count > 0) return { checked: true, breached: true, count };
      }
    }
    return { checked: true, breached: false, count: 0 };
  } catch (err) {
    // Timeout, DNS, proxy failure — fail open, but say so in the logs.
    console.warn(
      "[password-breach] check unavailable:",
      err instanceof Error ? err.message : String(err)
    );
    return { checked: false, breached: false, count: 0 };
  }
}
