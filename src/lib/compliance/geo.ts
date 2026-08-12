/**
 * Where is this request coming from?
 *
 * SECURITY — the single most important property of this module is that it
 * never trusts a client-supplied header.
 *
 * Vercel's edge sets x-vercel-ip-country / x-vercel-ip-country-region and
 * OVERWRITES any value the client sent, so on Vercel these headers are
 * trustworthy. Off Vercel nothing overwrites them, and an attacker could simply
 * send `x-vercel-ip-country: US` to place themselves in an allowed
 * jurisdiction. So the headers are read ONLY when process.env.VERCEL proves we
 * are actually behind that edge; everywhere else geo resolves to null and the
 * caller decides what an unknown location means.
 *
 * That decision is deliberately not made here: browsing with an unknown
 * location is fine, moving money with one is not. See gate.ts.
 */

export interface GeoLocation {
  country: string | null;
  region: string | null;
  /** True when the values came from a trusted edge, not from request headers. */
  trusted: boolean;
}

const UNKNOWN: GeoLocation = { country: null, region: null, trusted: false };

/** True when running behind an edge that stamps geo headers it controls. */
export function hasTrustedEdge(): boolean {
  return Boolean(process.env.VERCEL);
}

export function resolveGeo(headers: Headers): GeoLocation {
  if (!hasTrustedEdge()) return UNKNOWN;

  const country = normaliseCountry(headers.get("x-vercel-ip-country"));
  if (!country) return UNKNOWN;

  return {
    country,
    region: normaliseRegion(headers.get("x-vercel-ip-country-region")),
    trusted: true,
  };
}

function normaliseCountry(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

function normaliseRegion(raw: string | null): string | null {
  if (!raw) return null;
  // Vercel sends the ISO 3166-2 subdivision without the country prefix
  // ("CA", "WA"). Some edges send the full "US-CA" form; accept both.
  const v = raw.trim().toUpperCase();
  const bare = v.includes("-") ? v.split("-").pop()! : v;
  return /^[A-Z0-9]{1,3}$/.test(bare) ? bare : null;
}
