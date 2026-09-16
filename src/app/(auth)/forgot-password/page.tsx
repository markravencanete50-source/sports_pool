"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AuthForm } from "@/components/auth/auth-form";
import { FormInput } from "@/components/auth/form-input";
import Layout from "@/components/layout";
import {
  passwordResetRequestSchema,
  type PasswordResetRequestInput,
} from "@/lib/validations";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordResetRequestInput>({
    resolver: zodResolver(passwordResetRequestSchema),
  });

  const submit = async (values: PasswordResetRequestInput) => {
    setSubmitError(null);
    const response = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      setSubmitError(body.error ?? "Could not request a reset link. Try again.");
      return;
    }
    setMessage(
      body.message ??
        "If an account exists for that email, a password reset link is on its way."
    );
  };

  return (
    <Layout>
      <AuthForm
        title="Reset Password"
        subtitle="Enter your account email and we'll send a secure reset link."
        footerText="Remembered your password?"
        footerLinkText="Log In"
        footerLinkHref="/login"
        onSubmit={handleSubmit(submit)}
      >
        {message ? (
          <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm">
            {message}
          </p>
        ) : (
          <>
            {submitError && (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {submitError}
              </p>
            )}
            <FormInput
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...register("email")}
              error={errors.email?.message}
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full btn-3d-primary py-4 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Sending..." : "Send Reset Link"}
            </button>
          </>
        )}
      </AuthForm>
    </Layout>
  );
}
