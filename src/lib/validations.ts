import { z } from "zod";
import { poolConfig } from "./config";
import { PoolType, PoolStatus, GamePrediction } from "./enums";

export const signupSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .toLowerCase()
    .trim()
    .refine((email) => email.length > 0, "Email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
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
  })
  .strict();

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
  })
  .strict();

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
