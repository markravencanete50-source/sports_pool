"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { AuthForm } from "@/components/auth/auth-form";
import { FormInput } from "@/components/auth/form-input";
import Layout from "@/components/layout";
import {
  passwordResetCompleteSchema,
  type PasswordResetCompleteInput,
} from "@/lib/validations";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [linkState, setLinkState] = useState<"checking" | "valid" | "invalid">("checking");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordResetCompleteInput>({
    resolver: zodResolver(passwordResetCompleteSchema),
  });

  useEffect(() => {
    let active = true;
    fetch("/api/auth/password-reset/complete", {
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => {
        if (active) setLinkState(response.ok ? "valid" : "invalid");
      })
      .catch(() => {
        if (active) setLinkState("invalid");
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (values: PasswordResetCompleteInput) => {
    setSubmitError(null);
    const response = await fetch("/api/auth/password-reset/complete", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setSubmitError(body.error ?? "Could not update your password.");
      if (response.status === 401 || response.status === 403) setLinkState("invalid");
      return;
    }
    router.replace("/login?password_reset=1");
  };

  return (
    <Layout>
      <AuthForm
        title="Choose a Password"
        subtitle="Use a unique password with at least 10 characters, mixed case, and a number."
        footerText="Need another link?"
        footerLinkText="Request Reset"
        footerLinkHref="/forgot-password"
        onSubmit={handleSubmit(submit)}
      >
        {linkState === "checking" && (
          <p role="status" className="text-sm text-muted-foreground">Checking your reset link...</p>
        )}
        {linkState === "invalid" && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            This reset link is invalid or has expired. Request a new link to continue.
          </p>
        )}
        {linkState === "valid" && (
          <>
            {submitError && (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {submitError}
              </p>
            )}
            <FormInput
              label="New Password"
              type="password"
              autoComplete="new-password"
              {...register("password")}
              error={errors.password?.message}
            />
            <FormInput
              label="Confirm Password"
              type="password"
              autoComplete="new-password"
              {...register("confirmPassword")}
              error={errors.confirmPassword?.message}
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full btn-3d-primary py-4 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Updating..." : "Update Password"}
            </button>
          </>
        )}
      </AuthForm>
    </Layout>
  );
}
