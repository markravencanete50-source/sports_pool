"use client";

import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { CreateCheckoutSessionParams } from "@/lib/types";

export type { CreateCheckoutSessionParams } from "@/lib/types";

export function useStripeCheckout() {
  const mutation = useMutation({
    mutationFn: async (params: CreateCheckoutSessionParams) => {
      const res = await apiRequest(
        "POST",
        "/api/stripe/create-checkout-session",
        {
          poolId: params.poolId,
          entryFee: params.entryFee,
          picks: params.picks,
        }
      );
      const data = (await res.json()) as { url: string; sessionId?: string };
      if (!data.url || typeof data.url !== "string") {
        throw new Error("Invalid checkout session response");
      }
      // Browser privacy settings or a full storage quota must not strand a
      // successfully created checkout. The server also stores picks in Stripe.
      try {
        sessionStorage.setItem(
          `card-draft-v1-${params.poolId}`,
          JSON.stringify(params.picks),
        );
      } catch {
        // Draft recovery is optional; payment navigation is not.
      }
      return data.url;
    },
  });

  const createCheckoutSession = async (
    params: CreateCheckoutSessionParams
  ): Promise<void> => {
    const url = await mutation.mutateAsync(params);
    window.location.href = url;
  };

  return {
    createCheckoutSession,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
