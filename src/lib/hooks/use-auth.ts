"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { signinSchema, signupSchema } from "@/lib/validations";
import { useRouter } from "next/navigation";
import { DASHBOARD_PATH } from "@/lib/routes";
import { clearRealtimeToken } from "@/lib/supabase/realtime-client";

export function useAuth() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: user, isLoading: isLoadingUser } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      const data = await res.json();
      return data.user;
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const signupMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; name: string }) => {
      const validated = signupSchema.parse(data);
      const res = await apiRequest("POST", "/api/auth/signup", validated);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      router.push(DASHBOARD_PATH);
    },
  });

  const signinMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const validated = signinSchema.parse(data);
      const res = await apiRequest("POST", "/api/auth/signin", validated);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      router.push(DASHBOARD_PATH);
    },
  });

  const signoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/signout");
      return res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear(); // Clear all cached queries
      // The server cleared the session cookie; drop the realtime access token
      // held in memory too, so a subscription cannot keep using the signed-out
      // user's token until it happens to expire.
      clearRealtimeToken();
      router.push(DASHBOARD_PATH);
    },
  });

  return {
    user,
    isLoadingUser,
    isAuthenticated: !!user,
    signup: signupMutation.mutateAsync,
    signin: signinMutation.mutateAsync,
    signout: signoutMutation.mutateAsync,
    isSigningUp: signupMutation.isPending,
    isSigningIn: signinMutation.isPending,
    isSigningOut: signoutMutation.isPending,
    signupError: signupMutation.error,
    signinError: signinMutation.error,
  };
}
