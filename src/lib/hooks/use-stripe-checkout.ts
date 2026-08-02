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
        }
      );
      const data = (await res.json()) as { url: string; sessionId?: string };
      if (!data.url || typeof data.url !== "string") {
        throw new Error("Invalid checkout session response");
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
