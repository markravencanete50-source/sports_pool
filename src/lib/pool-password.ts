import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Pool passwords.
 *
 * A private pool's password is a shared secret with low entropy by nature —
 * people pick the team name — so it is treated like any credential: scrypt
 * with a per-pool salt, constant-time comparison, and a rate limit on the
 * route that checks it (RATE_LIMITS.poolAccess). The hash column carries no
 * client grant in either direction; only this module ever reads or writes it.
 *
 * Format: scrypt$<salt hex>$<hash hex>
 */
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const POOL_PASSWORD_MIN = 4;
export const POOL_PASSWORD_MAX = 64;

export function hashPoolPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPoolPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(
      password.normalize("NFKC"),
      Buffer.from(saltHex, "hex"),
      expected.length,
      SCRYPT_OPTIONS
    );
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Share slugs are trigger-generated; this only recognises the shape. */
export const SHARE_SLUG_PATTERN = /^[bcdfghjkmnpqrstvwxyz23456789]{10}$/;
