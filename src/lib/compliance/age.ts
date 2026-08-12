/**
 * Age arithmetic.
 *
 * Deliberately a pure function over a date string rather than a stored boolean:
 * a user who was 17 at signup becomes 18 without anyone writing a row, and a
 * stored "verified" flag would either go stale or need a nightly job. Age is
 * recomputed at every money boundary from the date of birth.
 */

/** Whole years elapsed, using UTC so a timezone shift cannot flip the answer. */
export function ageInYears(dateOfBirth: string | Date, asOf: Date = new Date()): number {
  const dob = typeof dateOfBirth === "string" ? new Date(`${dateOfBirth}T00:00:00Z`) : dateOfBirth;
  if (Number.isNaN(dob.getTime())) return Number.NaN;

  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Is this a date of birth we can act on at all?
 *
 * Rejects the future and the implausibly distant past. A malformed or absent
 * value is NOT treated as "probably fine" — callers must fail closed.
 */
export function isPlausibleDateOfBirth(dateOfBirth: string, asOf: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return false;
  // Round-trip guard: "2026-02-31" parses in JS but is not a real date.
  if (dob.toISOString().slice(0, 10) !== dateOfBirth) return false;
  if (dob.getTime() > asOf.getTime()) return false;
  return ageInYears(dob, asOf) <= 120;
}

export function meetsMinimumAge(
  dateOfBirth: string | null | undefined,
  minimumAge: number,
  asOf: Date = new Date()
): boolean {
  if (!dateOfBirth) return false;
  if (!isPlausibleDateOfBirth(dateOfBirth, asOf)) return false;
  return ageInYears(dateOfBirth, asOf) >= minimumAge;
}
