/**
 * Resolving a location to a rule.
 *
 * The rules live in the database rather than in this file on purpose: audit
 * item 9.F needs counsel to rule on each territory, and their answer must land
 * as a row update, not a code change and redeploy. This module only knows how
 * to pick the right row.
 *
 * Resolution is most-specific-first — an exact (country, region) match beats
 * the country-wide '*' row, which beats the configured default. That ordering
 * is what lets "US allowed, except Nevada" be expressed in two rows.
 */

export type JurisdictionStatus = "allowed" | "blocked" | "review";

export interface JurisdictionRule {
  country_code: string;
  region_code: string;
  status: JurisdictionStatus;
  minimum_age: number;
  requires_license: boolean;
  notes: string | null;
}

export interface ResolvedJurisdiction {
  status: JurisdictionStatus;
  minimumAge: number;
  /** The rule that decided this, or null when the default was used. */
  matchedRule: JurisdictionRule | null;
  /** How specific the match was — useful in the audit trail. */
  matchLevel: "region" | "country" | "default";
}

/**
 * 'review' means nobody has ruled on this territory yet. It refuses money
 * exactly like 'blocked' does — the difference is only that reporting can tell
 * "counsel said no" apart from "counsel has not looked", which matters when
 * you are working through the backlog.
 */
export function permitsPlay(status: JurisdictionStatus): boolean {
  return status === "allowed";
}

export function resolveJurisdiction(
  rules: JurisdictionRule[],
  country: string | null,
  region: string | null,
  defaults: { status: JurisdictionStatus; minimumAge: number }
): ResolvedJurisdiction {
  if (!country) {
    return {
      status: defaults.status,
      minimumAge: defaults.minimumAge,
      matchedRule: null,
      matchLevel: "default",
    };
  }

  const upperCountry = country.toUpperCase();
  const upperRegion = region?.toUpperCase() ?? null;

  if (upperRegion) {
    const exact = rules.find(
      (r) => r.country_code === upperCountry && r.region_code === upperRegion
    );
    if (exact) {
      return {
        status: exact.status,
        minimumAge: exact.minimum_age,
        matchedRule: exact,
        matchLevel: "region",
      };
    }
  }

  const countryWide = rules.find(
    (r) => r.country_code === upperCountry && r.region_code === "*"
  );
  if (countryWide) {
    return {
      status: countryWide.status,
      minimumAge: countryWide.minimum_age,
      matchedRule: countryWide,
      matchLevel: "country",
    };
  }

  return {
    status: defaults.status,
    minimumAge: defaults.minimumAge,
    matchedRule: null,
    matchLevel: "default",
  };
}
