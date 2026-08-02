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
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DASHBOARD_PATH } from "@/lib/routes";

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

  const onSubmit = async (data: SignupInput) => {
    try {
      await signup(data);
      toast.success("A verification link has been sent to your email.");
      setTimeout(() => router.push(DASHBOARD_PATH), 500);
    } catch (err: any) {
      const errorMessage = extractErrorMessage(err);
      toast.error(errorMessage);
    }
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
        onSubmit={handleSubmit(onSubmit)}
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
        <button
          type="submit"
          disabled={isSigningUp}
          className="w-full btn-3d-primary py-4 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSigningUp ? "Creating account..." : "Create Account"}
        </button>
      </AuthForm>
    </Layout>
  );
}
