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
