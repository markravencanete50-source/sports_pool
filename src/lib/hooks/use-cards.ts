import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../queryClient";
import { ParlayCard, CardPick, GamePrediction } from "../types";

export function usePoolCards(poolId: string) {
  return useQuery({
    queryKey: ["/api/pools", poolId, "cards"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/pools/${poolId}/cards`);
      const data = await res.json();
      return data.cards as ParlayCard[];
    },
    enabled: !!poolId,
  });
}

export function usePurchaseCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      poolId,
      entryFee,
    }: {
      poolId: string;
      entryFee: number;
    }) => {
      const res = await apiRequest("POST", `/api/pools/${poolId}/cards/purchase`, { entryFee });
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/pools", variables.poolId, "cards"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/pools", variables.poolId],
      });
    },
  });
}

export function useSubmitCardPick() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      poolId,
      cardId,
      gameId,
      prediction,
      totalScorePrediction,
    }: {
      poolId: string;
      cardId: string;
      gameId: string;
      prediction: GamePrediction;
      totalScorePrediction?: number;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/pools/${poolId}/cards/${cardId}/picks`,
        {
          gameId,
          prediction,
          totalScorePrediction,
        }
      );
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/pools", variables.poolId, "cards"],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "/api/pools",
          variables.poolId,
          "cards",
          variables.cardId,
          "picks",
        ],
      });
    },
  });
}

export function useLockCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ poolId, cardId }: { poolId: string; cardId: string }) => {
      const res = await apiRequest(
        "POST",
        `/api/pools/${poolId}/cards/${cardId}/lock`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to lock picks");
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/pools", variables.poolId, "cards"],
      });
    },
  });
}

export function useCardPicks(poolId: string, cardId: string) {
  return useQuery({
    queryKey: ["/api/pools", poolId, "cards", cardId, "picks"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/pools/${poolId}/cards/${cardId}/picks`);
      const data = await res.json();
      return data.picks as CardPick[];
    },
    enabled: !!poolId && !!cardId,
  });
}

