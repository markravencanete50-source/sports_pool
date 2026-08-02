"use client";

import Layout from "@/components/layout";
import { AuthForm } from "@/components/auth/auth-form";
import { FormInput } from "@/components/auth/form-input";
import { useAuth } from "@/lib/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signinSchema, SigninInput } from "@/lib/validations";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/error-utils";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DASHBOARD_PATH } from "@/lib/routes";

function LoginForm() {
  const { signin, isSigningIn, signinError, isAuthenticated, isLoadingUser } =
    useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isLoadingUser && isAuthenticated) {
      const redirect = searchParams.get("redirect") || DASHBOARD_PATH;
      router.push(redirect);
    }
  }, [isAuthenticated, isLoadingUser, router, searchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SigninInput>({
    resolver: zodResolver(signinSchema),
  });

  const onSubmit = async (data: SigninInput) => {
    try {
      await signin(data);
      toast.success("Welcome back!");
      const redirect = searchParams.get("redirect") || DASHBOARD_PATH;
      setTimeout(() => router.push(redirect), 400);
    } catch (err: any) {
      const errorMessage = extractErrorMessage(err);
      toast.error(errorMessage);
    }
  };

  if (isLoadingUser) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </Layout>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <Layout>
      <AuthForm
        title="Welcome Back"
        subtitle="Log in to manage your pools and picks."
        footerText="Don't have an account?"
        footerLinkText="Sign Up"
        footerLinkHref="/signup"
        onSubmit={handleSubmit(onSubmit)}
      >
        {signinError && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
            {extractErrorMessage(signinError)}
          </div>
        )}
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
          rightElement={
            <span className="text-xs text-primary hover:underline cursor-pointer">
              Forgot?
            </span>
          }
        />
        <button
          type="submit"
          disabled={isSigningIn}
          className="w-full btn-3d-primary py-4 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSigningIn ? "Signing in..." : "Log In"}
        </button>
      </AuthForm>
    </Layout>
  );
}

export default function Login() {
  return (
    <Suspense
      fallback={
        <Layout>
          <div className="flex items-center justify-center min-h-[80vh]">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </Layout>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
