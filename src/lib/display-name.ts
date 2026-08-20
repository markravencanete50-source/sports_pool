import { z } from "zod";

/**
 * Display-name rules, shared by the client, the API and (in mirrored form) the
 * database.
 *
 * THE DATABASE IS THE AUTHORITY, not this file. `display_name_key()` and the
 * `users_name_format` constraint in migration 20260820000000 are what actually
 * hold, because `authenticated` holds UPDATE(name) on public.users and can
 * therefore reach the column without passing through this code at all. What
 * lives here exists so a rejection arrives as a sentence the user can act on
 * rather than as a constraint-violation error — and so the two layers agree.
 *
 * Keep them in step. If the rule changes, it changes in the migration first
 * and here second; tests/lib.test.ts pins the pairs that must normalise
 * identically.
 */

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 24;

/**
 * Characters whose only purpose in a display name is to defeat a uniqueness
 * check while rendering as nothing: zero-width space, non-joiner, joiner, the
 * LTR/RTL marks, the bidi embedding and override controls, the word joiner and
 * the BOM.
 *
 * Without stripping these, "ad​min" is a different string from "admin" in
 * every comparison and an identical one on every screen.
 */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

/**
 * The uniqueness key. MUST match `public.display_name_key(text)` exactly:
 * strip invisibles, collapse internal whitespace, trim, lowercase.
 */
export function displayNameKey(raw: string): string {
  return raw
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * What actually gets stored. Same cleanup as the key, but WITHOUT folding case:
 * the key decides uniqueness, the stored value carries the user's own
 * capitalisation. "John Smith" stays "John Smith" and merely cannot coexist
 * with "john smith".
 */
export function normalizeDisplayName(raw: string): string {
  return raw.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

/**
 * Mirrors the character class in the `users_name_format` check constraint.
 *
 * ASCII-ONLY, AND THAT IS A PRODUCT DECISION, not an oversight: it means
 * "José" and "大輔" are not accepted as display names. It buys a large
 * reduction in homoglyph impersonation (Cyrillic "а" beside Latin "a" next to
 * a payout announcement) and it removes a real divergence — Postgres `lower()`
 * folds non-ASCII according to the database collation, while JavaScript
 * `toLowerCase()` always applies full Unicode folding, so the two layers can
 * compute different keys for the same input. That divergence is currently
 * unreachable precisely BECAUSE of this restriction: every non-ASCII name is
 * rejected by both layers before its key is ever used. Widen this class and
 * that stops being true — see the cross-layer test in tests/lib.test.ts.
 */
const KEY_CHARSET = /^[a-z0-9 ._-]+$/;
const HAS_ALPHANUMERIC = /[a-z0-9]/;

export type DisplayNameProblem =
  | "too_short"
  | "too_long"
  | "invalid_characters"
  | "no_alphanumeric";

/**
 * Why a name is unacceptable, or null when it is fine. Uniqueness is NOT
 * checked here — that needs the database, and a name being free is a fact with
 * a shelf life of about a second.
 */
export function checkDisplayNameShape(raw: string): DisplayNameProblem | null {
  const key = displayNameKey(raw);
  if (key.length < DISPLAY_NAME_MIN) return "too_short";
  if (key.length > DISPLAY_NAME_MAX) return "too_long";
  if (!KEY_CHARSET.test(key)) return "invalid_characters";
  if (!HAS_ALPHANUMERIC.test(key)) return "no_alphanumeric";
  return null;
}

/** User-facing wording. One sentence, says what to do rather than what failed. */
export const DISPLAY_NAME_MESSAGES: Record<DisplayNameProblem, string> = {
  too_short: `Display name must be at least ${DISPLAY_NAME_MIN} characters.`,
  too_long: `Display name must be ${DISPLAY_NAME_MAX} characters or fewer.`,
  invalid_characters:
    "Display name can use letters, numbers, spaces, and . _ - only.",
  no_alphanumeric: "Display name must contain at least one letter or number.",
};

export function describeDisplayNameProblem(raw: string): string | null {
  const problem = checkDisplayNameShape(raw);
  return problem ? DISPLAY_NAME_MESSAGES[problem] : null;
}

/**
 * Zod schema for the API boundary. Transforms to the stored form, so a route
 * that parses with this cannot accidentally persist the raw input.
 */
export const displayNameSchema = z
  .string()
  .min(1, "Display name is required")
  // Bound the input before any regex work: the transform below is linear, but
  // accepting an unbounded string into validation is a habit worth not having.
  .max(200, DISPLAY_NAME_MESSAGES.too_long)
  .transform(normalizeDisplayName)
  .superRefine((value, ctx) => {
    const problem = checkDisplayNameShape(value);
    if (problem) {
      ctx.addIssue({ code: "custom", message: DISPLAY_NAME_MESSAGES[problem] });
    }
  });
