import { z } from "zod";
import { poolConfig } from "./config";
import { PoolType, PoolStatus, GamePrediction } from "./enums";
import { isPlausibleDateOfBirth, meetsMinimumAge } from "./compliance/age";

export const signupSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .toLowerCase()
    .trim()
    .refine((email) => email.length > 0, "Email is required"),
  // Supabase Auth's leaked-password check (HaveIBeenPwned) is a Pro-plan
  // feature and this project is on the free plan, so credential stuffing
  // against known-breached passwords is not blocked at the platform level.
  // Requiring a mix of character classes raises the cost of guessing in the
  // meantime — see docs/guides/auth/password-security.
  //
  // This covers the signup route only. The dashboard equivalent
  // (Authentication -> Providers -> Email: minimum length + required
  // characters) applies to every path including password reset, is available
  // on the free plan, and should be set to match.
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  /*
   * Age gate. 18 is the global floor enforced here; jurisdictions that require
   * more (21 in several US states) are enforced at the money boundary by the
   * compliance gate, which knows where the player actually is. Signing up is
   * not itself a regulated act — buying a card is — so this schema deliberately
   * enforces only the floor and leaves the higher bar to the gate.
   *
   * Validated server-side on every signup: this schema is the one the route
   * parses, so a hand-rolled POST cannot skip it.
   */
  dateOfBirth: z
    .string()
    .refine((d) => isPlausibleDateOfBirth(d), "Enter a valid date of birth")
    .refine((d) => meetsMinimumAge(d, 18), "You must be at least 18 to create an account"),
  acceptTerms: z.literal(true, {
    message: "You must accept the Terms and Contest Rules",
  }),
});

export const signinSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .toLowerCase()
    .trim()
    .refine((email) => email.length > 0, "Email is required"),
  password: z.string().min(1, "Password is required"),
});

export const newsletterSignupSchema = z.object({
  email: z
    .string()
    .email("Enter a valid email address")
    .toLowerCase()
    .trim()
    .refine((email) => email.length > 0, "Email is required"),
});

/** ISO timestamp the browser can produce from a datetime-local input. */
const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date and time");

/**
 * Pool entry window. Both ends optional (null = the pre-window behaviour: open
 * until the games start). When both are set the window must run forwards and
 * fit the platform cap — the cap itself is read from platform_settings in the
 * route, so this only enforces the absolute ceiling the schema constraint
 * also enforces (seven days).
 */
export const POOL_WINDOW_MAX_DAYS = 7;

function windowIsValid(data: { startsAt?: string | null; endsAt?: string | null }): boolean {
  if (!data.startsAt || !data.endsAt) return true;
  const start = Date.parse(data.startsAt);
  const end = Date.parse(data.endsAt);
  if (!(end > start)) return false;
  return end - start <= POOL_WINDOW_MAX_DAYS * 24 * 3600_000;
}

export const poolPasswordSchema = z
  .string()
  .min(4, "Pool password must be at least 4 characters")
  .max(64, "Pool password is too long");

export const createPoolSchema = z
  .object({
    name: z.string().min(3, "Pool name must be at least 3 characters"),
    type: z.enum([PoolType.PUBLIC, PoolType.PRIVATE]),
    entryFee: z.number().min(20, "Entry fee must be at least $20"),
    maxParticipants: z.number().positive().nullable(),
    week: z.number().int().positive(),
    selectedGames: z
      .array(z.string())
      .min(poolConfig.minGames, `Select at least ${poolConfig.minGames} games`)
      .max(
        poolConfig.maxGames,
        `Maximum ${poolConfig.maxGames} games per pool`
      ),
    invitedFriends: z.array(z.string()).optional(),
    invitedEmails: z.array(z.string().email()).optional(),
    sport: z.string().regex(/^[a-z0-9_]{2,20}$/).optional(),
    startsAt: isoDateTime.nullable().optional(),
    endsAt: isoDateTime.nullable().optional(),
    /** Private pools only; ignored (and refused) for public ones in the route. */
    password: poolPasswordSchema.nullable().optional(),
  })
  .strict()
  .refine(windowIsValid, {
    message: `The pool window must end after it starts and last at most ${POOL_WINDOW_MAX_DAYS} days`,
    path: ["endsAt"],
  });

export const updatePoolSchema = z.object({
  name: z.string().min(3).optional(),
  status: z
    .enum([PoolStatus.OPEN, PoolStatus.ACTIVE, PoolStatus.COMPLETED])
    .optional(),
});

export const updatePoolWithGamesSchema = z
  .object({
    name: z.string().min(3).optional(),
    selectedGames: z.array(z.string()).optional(),
    startsAt: isoDateTime.nullable().optional(),
    endsAt: isoDateTime.nullable().optional(),
    /** null clears the password; a string sets a new one. */
    password: poolPasswordSchema.nullable().optional(),
  })
  .strict()
  .refine(windowIsValid, {
    message: `The pool window must end after it starts and last at most ${POOL_WINDOW_MAX_DAYS} days`,
    path: ["endsAt"],
  });

export const submitPickSchema = z
  .object({
    poolId: z.string(),
    gameId: z.string(),
    teamId: z.string().optional(),
    prediction: z
      .enum([
        GamePrediction.HOME_WIN,
        GamePrediction.AWAY_WIN,
        GamePrediction.TIE,
      ])
      .optional(),
    totalScorePrediction: z.number().int().positive().max(200).optional(),
  })
  .refine(
    (data) => data.teamId || data.prediction,
    "Either teamId or prediction must be provided"
  );

export const createCommentSchema = z.object({
  poolId: z.string(),
  text: z
    .string()
    .min(1, "Comment cannot be empty")
    .max(500, "Comment too long"),
  /** Optional: thread the comment under one of the pool's games. */
  gameId: z.string().min(1).max(40).optional(),
});

export const contentReportSchema = z.object({
  commentId: z.string().uuid("Invalid comment id").optional(),
  reason: z.string().trim().min(3, "Tell us what is wrong").max(500, "Reason too long"),
});

export const acceptChatRulesSchema = z.object({
  version: z.string().trim().min(1).max(40),
});

export const poolAccessSchema = z.object({
  password: z.string().min(1, "Password is required").max(128),
});

export const promotionRequestSchema = z.object({
  placement: z.enum(["featured", "boosted", "spotlight"]).default("featured"),
  days: z.number().int().min(1).max(30).default(7),
  note: z.string().trim().max(500).optional(),
});

const uuidSchema = z.string().uuid("Invalid pool ID format");

export const createCheckoutSessionSchema = z.object({
  poolId: uuidSchema,
  entryFee: z.number().min(20, "Entry fee must be at least $20").max(99999),
});

export const confirmPaymentSchema = z.object({
  sessionId: z
    .string()
    .min(1, "Session ID is required")
    .startsWith("cs_", "Invalid Stripe session ID"),
});

/*
 * Money / account-mutation bodies. These five routes previously hand-rolled
 * their checks (`typeof body.x === "string"` and friends), which worked but
 * left no shared contract and made each route's error shape subtly different.
 * Everything a client can PUT/POST/PATCH now parses through a schema here.
 */

export const payoutAccountSchema = z.object({
  // Only PayPal today. z.literal keeps the 400 message honest if a client
  // sends another method, rather than silently coercing.
  method: z.literal("paypal", {
    message: "Only PayPal is supported for now",
  }),
  identifier: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid PayPal email address")
    .max(320),
});

export const payoutRequestSchema = z.object({
  // coerce: the UI has historically sent the amount as a string.
  // The business floor (MINIMUM_PAYOUT_AMOUNT) stays in the route so the
  // error message can quote the configured value.
  amount: z.coerce.number().finite().positive(),
});

export const claimPayoutSchema = z.object({
  poolId: z.string().uuid("Invalid pool ID format"),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(["user", "admin"], {
    message: "Invalid role. Use 'admin' or 'user'.",
  }),
});

export const completePayoutSchema = z.object({
  comment: z.string().trim().max(500, "Comment too long").optional(),
});

/** Route params that must be UUIDs (notification ids, invitation ids, …). */
export const uuidParamSchema = z.string().uuid("Invalid id format");

export type SignupInput = z.infer<typeof signupSchema>;
export type SigninInput = z.infer<typeof signinSchema>;
export type NewsletterSignupInput = z.infer<typeof newsletterSignupSchema>;
export type CreatePoolInput = z.infer<typeof createPoolSchema>;
export type UpdatePoolInput = z.infer<typeof updatePoolSchema>;
export type UpdatePoolWithGamesInput = z.infer<
  typeof updatePoolWithGamesSchema
>;
export type SubmitPickInput = z.infer<typeof submitPickSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CreateCheckoutSessionInput = z.infer<
  typeof createCheckoutSessionSchema
>;
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
