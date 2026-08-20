"use client";

import Layout from "@/components/layout";
import { AuthForm } from "@/components/auth/auth-form";
import { FormInput } from "@/components/auth/form-input";
import { useAuth } from "@/lib/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, SignupInput } from "@/lib/validations";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/error-utils";
import { FormErrorDialog } from "@/components/auth/form-error-dialog";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DASHBOARD_PATH } from "@/lib/routes";
import Link from "next/link";

export default function Signup() {
  const { signup, isSigningUp, signupError, isAuthenticated, isLoadingUser } =
    useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoadingUser && isAuthenticated) {
      router.push(DASHBOARD_PATH);
    }
  }, [isAuthenticated, isLoadingUser, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
  });

  /**
   * Human labels for the modal, so it reads "Date of birth" rather than
   * "dateOfBirth". Kept in form order — the list should match what the user is
   * looking at, not object-key order.
   */
  const FIELD_LABELS: Record<string, string> = {
    name: "Name",
    email: "Email",
    password: "Password",
    dateOfBirth: "Date of birth",
    acceptTerms: "Terms and Contest Rules",
  };

  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<
    Array<{ field: string; message: string }>
  >([]);

  const onSubmit = async (data: SignupInput) => {
    try {
      await signup(data);
      toast.success("A verification link has been sent to your email.");
      setTimeout(() => router.push(DASHBOARD_PATH), 500);
    } catch (err) {
      // A server rejection (email already taken, breached password, an
      // under-age date that only the server re-checks) deserves the same
      // treatment as a client-side one: say so where the user is looking.
      const errorMessage = extractErrorMessage(err);
      setSubmitErrors([{ field: "Could not create your account", message: errorMessage }]);
      setErrorDialogOpen(true);
    }
  };

  /**
   * Fired by react-hook-form when the schema rejects the submission.
   *
   * Without this the button silently does nothing: on a phone the offending
   * field is usually scrolled off-screen, so the only feedback is red text the
   * user cannot see. Focusing the first bad field is the other half — closing
   * the modal should leave them somewhere useful, not back where they were.
   */
  const onInvalid = (formErrors: typeof errors) => {
    const ordered = Object.keys(FIELD_LABELS)
      .filter((key) => formErrors[key as keyof SignupInput])
      .map((key) => ({
        field: FIELD_LABELS[key],
        message:
          formErrors[key as keyof SignupInput]?.message ?? "This field is not valid.",
      }));

    setSubmitErrors(ordered);
    setErrorDialogOpen(true);
  };

  // Show loading state while checking auth
  if (isLoadingUser) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </Layout>
    );
  }

  // Don't render form if already authenticated (will redirect)
  if (isAuthenticated) {
    return null;
  }

  return (
    <Layout>
      <AuthForm
        title="Join the League"
        subtitle="Create your account to start betting."
        footerText="Already have an account?"
        footerLinkText="Log In"
        footerLinkHref="/login"
        onSubmit={handleSubmit(onSubmit, onInvalid)}
      >
        {signupError && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
            {extractErrorMessage(signupError)}
          </div>
        )}
        <FormInput
          label="Name"
          type="text"
          placeholder="GridironKing"
          {...register("name")}
          error={errors.name?.message}
        />
        <FormInput
          label="Email"
          type="email"
          placeholder="you@example.com"
          {...register("email")}
          error={errors.email?.message}
        />
        <FormInput
          label="Password"
          type="password"
          placeholder="••••••••"
          {...register("password")}
          error={errors.password?.message}
        />
        {/*
          Age gate. The browser control is a convenience — the same date is
          re-validated server-side by signupSchema, and every paid action
          re-checks it against the minimum age for the player's actual
          jurisdiction, so editing this field in devtools buys nothing.
        */}
        <FormInput
          label="Date of birth"
          type="date"
          max={new Date().toISOString().slice(0, 10)}
          {...register("dateOfBirth")}
          error={errors.dateOfBirth?.message}
        />

        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <input
              id="accept-terms"
              type="checkbox"
              {...register("acceptTerms")}
              className="mt-0.5 size-6 shrink-0 rounded border-white/20 bg-black/20 accent-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <label htmlFor="accept-terms" className="text-sm text-muted-foreground leading-relaxed">
              I am of legal age in my jurisdiction and I accept the{" "}
              <Link href="/terms" className="text-primary hover:underline">Terms</Link>,{" "}
              <Link href="/contest-rules" className="text-primary hover:underline">Contest Rules</Link>{" "}
              and <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
            </label>
          </div>
          {errors.acceptTerms?.message && (
            <p className="text-xs text-destructive">{errors.acceptTerms.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSigningUp}
          className="w-full btn-3d-primary py-4 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSigningUp ? "Creating account..." : "Create Account"}
        </button>
      </AuthForm>

      <FormErrorDialog
        open={errorDialogOpen}
        onOpenChange={setErrorDialogOpen}
        errors={submitErrors}
      />
    </Layout>
  );
}
