/**
 * Where is this request coming from?
 *
 * SECURITY — the single most important property of this module is that it
 * never trusts a client-supplied header.
 *
 * Vercel's edge sets x-vercel-ip-country / x-vercel-ip-country-region and
 * OVERWRITES any value the client sent, so on Vercel these headers are
 * trustworthy. Cloudflare does the same with cf-ipcountry (and cf-region-code
 * when the "Add visitor location headers" managed transform is on). Off those
 * edges nothing overwrites them, and an attacker could simply send
 * `x-vercel-ip-country: US` to place themselves in an allowed jurisdiction.
 *
 * So each header family is read ONLY behind an explicit signal that the
 * request actually transited that edge — the same contract getClientIp() in
 * rate-limit.ts uses:
 *   - Vercel sets process.env.VERCEL on every deployment.
 *   - A Cloudflare-fronted self-host (the docker-compose stack terminates
 *     ingress at the cloudflared tunnel) must set TRUSTED_PROXY=cloudflare.
 *     Without the tunnel, do NOT set it: an origin reachable directly makes
 *     cf-ipcountry client-forgeable again.
 *
 * Everywhere else geo resolves to null and the caller decides what an unknown
 * location means. That decision is deliberately not made here: browsing with
 * an unknown location is fine, moving money with one is not. See gate.ts.
 */

export interface GeoLocation {
  country: string | null;
  region: string | null;
  /** True when the values came from a trusted edge, not from request headers. */
  trusted: boolean;
}

const UNKNOWN: GeoLocation = { country: null, region: null, trusted: false };

function behindCloudflare(): boolean {
  return process.env.TRUSTED_PROXY?.trim().toLowerCase() === "cloudflare";
}

/** True when running behind an edge that stamps geo headers it controls. */
export function hasTrustedEdge(): boolean {
  return Boolean(process.env.VERCEL) || behindCloudflare();
}

export function resolveGeo(headers: Headers): GeoLocation {
  // Vercel first: when both signals are present (a Cloudflare-proxied Vercel
  // deployment), Vercel's headers are stamped last and are the closer edge.
  if (process.env.VERCEL) {
    const country = normaliseCountry(headers.get("x-vercel-ip-country"));
    if (!country) return UNKNOWN;

    return {
      country,
      region: normaliseRegion(headers.get("x-vercel-ip-country-region")),
      trusted: true,
    };
  }

  if (behindCloudflare()) {
    const country = normaliseCountry(headers.get("cf-ipcountry"));
    if (!country) return UNKNOWN;

    return {
      country,
      region: normaliseRegion(headers.get("cf-region-code")),
      trusted: true,
    };
  }

  return UNKNOWN;
}

function normaliseCountry(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase();
  // Cloudflare sentinels: XX = could not geolocate, T1 = Tor exit. T1 already
  // fails the pattern; XX must be rejected explicitly or it would read as a
  // real country and dodge the fail-closed unknown-location handling.
  if (v === "XX") return null;
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

function normaliseRegion(raw: string | null): string | null {
  if (!raw) return null;
  // Vercel sends the ISO 3166-2 subdivision without the country prefix
  // ("CA", "WA"), as does Cloudflare's cf-region-code. Some edges send the
  // full "US-CA" form; accept both.
  const v = raw.trim().toUpperCase();
  const bare = v.includes("-") ? v.split("-").pop()! : v;
  return /^[A-Z0-9]{1,3}$/.test(bare) ? bare : null;
}
