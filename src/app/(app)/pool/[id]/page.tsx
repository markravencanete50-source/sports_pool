"use client";

import Layout from "@/components/layout";
import { GameCard } from "@/components/game-card";
import { CommentSection } from "@/components/comment-section";
import { useParams, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Users, Calendar, Loader2, RefreshCw, Pencil } from "lucide-react";
import { ProgressCard } from "@/components/pool-detail/progress-card";
import { useQueryClient } from "@tanstack/react-query";
import { usePool, usePoolComments, useAddComment, useUpdatePool } from "@/lib/hooks/use-pools";
import {
  usePoolCards,
  useSubmitCardPick,
  useLockCard,
} from "@/lib/hooks/use-cards";
import { useSyncPoolGames } from "@/lib/hooks/use-sync-pool-games";
import { CardPurchaseButton } from "@/components/pool-detail/card-purchase-button";
import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/hooks/use-auth";
import { CardSelector as CardSelectorComponent } from "@/components/pool-detail/card-selector";
import { PoolInviteByEmail } from "@/components/pool-detail/pool-invite-by-email";
import { PoolEditModal } from "@/components/pool-detail/pool-edit-modal";
import { GamePrediction } from "@/lib/types";
import { DISRUPTED_STATUSES } from "@/lib/constants";
import type { GameCardProps, GameResult } from "@/lib/interfaces";

type PoolGameRow = {
  id: string;
  date: string;
  status?: string | null;
  home_team_id: string;
  away_team_id: string;
  home_score?: number | null;
  away_score?: number | null;
};

type PoolDetail = {
  id: string;
  name: string;
  type: string;
  week: number;
  participants: number;
  status?: string | null;
  created_by?: string | null;
  can_edit?: boolean;
  entryFee?: number;
  entry_fee?: number;
  prizePot?: number;
  prize_pot?: number;
  pool_games?: Array<{ games?: PoolGameRow | null }>;
};

type PoolCommentRow = {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  users?: { id: string; name: string; avatar?: string | null };
};

type AuthUser = {
  id?: string;
  role?: string | null;
  app_metadata?: { role?: string | null };
};

export default function PoolDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const poolId = params?.id as string;
  const { user: authUser } = useAuth();
  const user = authUser as AuthUser | null | undefined;
  const queryClient = useQueryClient();
  const confirmedSessionRef = useRef<string | null>(null);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

  const {
    data: poolData,
    isLoading: isLoadingPool,
    error: poolError,
  } = usePool(poolId);
  const pool = poolData as PoolDetail | undefined;
  const {
    data: cards = [],
    isLoading: isLoadingCards,
    refetch: refetchCards,
  } = usePoolCards(poolId);
  const {
    data: comments = [],
    isLoading: isLoadingComments,
    error: commentsError,
  } = usePoolComments(poolId);
  const requiresCard =
    (commentsError as (Error & { requiresCard?: boolean }) | null)
      ?.requiresCard || false;
  const addCommentMutation = useAddComment();
  const submitCardPickMutation = useSubmitCardPick();
  const lockCardMutation = useLockCard();
  const syncPoolGamesMutation = useSyncPoolGames(poolId);
  const updatePoolMutation = useUpdatePool(poolId);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [pendingPicks, setPendingPicks] = useState<
    Record<string, { prediction: GamePrediction }>
  >({});

  // Derived instead of set in an effect: fall back to the first card until the
  // user explicitly selects one.
  const effectiveCardId = selectedCardId ?? cards[0]?.id ?? null;

  const selectedCard = cards.find((c) => c.id === effectiveCardId);
  const hasSelectedCard = !!selectedCard;
  const selectedCardStatus = selectedCard?.status;
  const selectedCardPicks = selectedCard?.card_picks;
  useEffect(() => {
    const locked =
      selectedCardStatus === "active" ||
      selectedCardStatus === "completed" ||
      selectedCardStatus === "cancelled";
    const fromServer: Record<string, { prediction: GamePrediction }> = {};
    if (hasSelectedCard && !locked) {
      (selectedCardPicks ?? []).forEach((pick) => {
        fromServer[pick.game_id] = { prediction: pick.prediction };
      });
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-seeds the local draft picks from freshly fetched server card data; genuine server-state sync
    setPendingPicks(fromServer);
  }, [effectiveCardId, hasSelectedCard, selectedCardStatus, selectedCardPicks]);

  const poolGames = useMemo(() => {
    if (!pool?.pool_games) return [];
    return pool.pool_games
      .map((pg) => pg.games)
      .filter(
        (game): game is PoolGameRow => game !== null && game !== undefined
      );
  }, [pool]);

  const endsLabel = useMemo(() => {
    if (poolGames.length === 0) return "Schedule TBD";
    const lastGame = poolGames.reduce((latest, game) =>
      new Date(game.date) > new Date(latest.date) ? game : latest
    );
    return `Ends ${format(new Date(lastGame.date), "EEE, MMM d")}`;
  }, [poolGames]);

  const cardPicks = useMemo(() => {
    if (!selectedCard?.card_picks) return {};
    const picksMap: Record<
      string,
      { prediction: string; totalScore?: number }
    > = {};
    selectedCard.card_picks.forEach((pick) => {
      picksMap[pick.game_id] = {
        prediction: pick.prediction,
        totalScore: pick.total_score_prediction,
      };
    });
    return picksMap;
  }, [selectedCard]);

  const isCardLocked =
    selectedCard?.status === "active" ||
    selectedCard?.status === "completed" ||
    selectedCard?.status === "cancelled";
  const effectivePicks = isCardLocked ? cardPicks : pendingPicks;
  const isPoolCompleted = pool?.status === "completed";

  function getGameResult(
    game: PoolGameRow,
    userPrediction: string | undefined
  ): GameResult | null {
    if (!userPrediction || !game) return null;
    const status = (game.status ?? "").toLowerCase();
    const disrupted = (DISRUPTED_STATUSES as readonly string[]).includes(status);
    const homeScore = game.home_score ?? null;
    const awayScore = game.away_score ?? null;
    const finished = status === "finished" && homeScore != null && awayScore != null;

    let actualOutcome: GameResult["actualOutcome"];
    if (disrupted) {
      actualOutcome = "disrupted";
      return { actualOutcome, pickCorrect: true, homeScore, awayScore };
    }
    if (!finished) return null;
    if (homeScore! > awayScore!) actualOutcome = "home_win";
    else if (awayScore! > homeScore!) actualOutcome = "away_win";
    else actualOutcome = "tie";
    const pickCorrect = userPrediction === actualOutcome;
    return { actualOutcome, pickCorrect, homeScore, awayScore };
  }
  const canSubmitPicks =
    !isPoolCompleted &&
    selectedCard?.status === "pending" &&
    poolGames.length > 0 &&
    poolGames.every((g) => pendingPicks[g.id]);

  const handlePick = (gameId: string, prediction: GamePrediction) => {
    if (isCardLocked || !effectiveCardId) return;
    setPendingPicks((prev) => ({ ...prev, [gameId]: { prediction } }));
  };

  const handleSubmitPicks = async () => {
    if (!poolId || !effectiveCardId || !canSubmitPicks) return;
    try {
      await Promise.all(
        poolGames.map((game) =>
          submitCardPickMutation.mutateAsync({
            poolId,
            cardId: effectiveCardId,
            gameId: game.id,
            prediction: pendingPicks[game.id].prediction,
          })
        )
      );
      await lockCardMutation.mutateAsync({ poolId, cardId: effectiveCardId });
      toast.success("Picks submitted! Your card is locked.");
      refetchCards();
    } catch (error) {
      toast.error((error as Error | null)?.message ?? "Failed to submit picks");
    }
  };

  const handleAddComment = async (text: string) => {
    if (!poolId) return;
    try {
      await addCommentMutation.mutateAsync({
        poolId,
        text,
      });
      toast.success("Comment added!");
    } catch (error) {
      const errorMessage =
        (error as Error | null)?.message || "Failed to add comment";
      if (errorMessage.includes("must purchase a card")) {
        toast.error("You must purchase a card to access chat");
      } else {
        toast.error(errorMessage);
      }
    }
  };

  const handlePurchaseSuccess = () => {
    refetchCards();
  };

  const handleEditPoolSave = async (data: {
    name: string;
    selectedGames: string[];
  }) => {
    try {
      await updatePoolMutation.mutateAsync(data);
      toast.success("Pool updated!");
      queryClient.invalidateQueries({ queryKey: ["/api/pools", poolId] });
      setIsEditModalOpen(false);
    } catch (error) {
      toast.error((error as Error | null)?.message ?? "Failed to update pool");
      throw error;
    }
  };

  const sessionId = searchParams.get("session_id");
  useEffect(() => {
    if (!sessionId || !poolId) return;
    const storageKey = `confirm-payment-${sessionId}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(storageKey))
      return;
    if (confirmedSessionRef.current === sessionId) return;
    confirmedSessionRef.current = sessionId;
    if (typeof window !== "undefined") sessionStorage.setItem(storageKey, "1");
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot Stripe redirect handler: the confirming flag must be raised before the async confirm call so the purchase UI never flashes
    setIsConfirmingPayment(true);

    (async () => {
      try {
        const res = await fetch("/api/stripe/confirm-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
          credentials: "include",
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setIsConfirmingPayment(false);
          toast.error(data.error ?? "Payment confirmation failed");
          return;
        }
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["/api/pools", poolId, "cards"],
          }),
          queryClient.invalidateQueries({ queryKey: ["/api/pools", poolId] }),
        ]);
        window.history.replaceState({}, "", `/pool/${poolId}`);
        setIsConfirmingPayment(false);
        if (!cancelled) toast.success("Payment confirmed! Your card is ready.");
      } catch {
        if (!cancelled) {
          setIsConfirmingPayment(false);
          toast.error("Failed to confirm payment");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, poolId, queryClient]);

  if (isLoadingPool) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (poolError || !pool) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-destructive">Pool not found</p>
        </div>
      </Layout>
    );
  }

  const entryFee = pool.entryFee ?? pool.entry_fee ?? 20;
  const prizePot = pool.prizePot ?? pool.prize_pot ?? 0;

  return (
    <Layout>
      <div className="space-y-8 pb-20">
        <div className="glass-panel p-5 sm:p-8 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-0.5 bg-primary text-white text-[10px] font-bold uppercase tracking-widest rounded">
                  {pool.type}
                </span>
                <span className="text-sm text-muted-foreground font-mono uppercase">
                  Week {pool.week}
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black font-display italic uppercase tracking-tight mb-4 break-words">
                {pool.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span className="text-foreground">
                    {pool.participants} Players
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{endsLabel}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-stretch md:items-end gap-3 shrink-0">
              <div className="flex flex-col items-start md:items-end justify-center bg-black/20 p-4 sm:p-6 rounded-xl border border-white/5 md:min-w-[200px]">
                <span className="text-xs text-muted-foreground uppercase font-mono mb-1">
                  Total Prize Pot
                </span>
                <span className="text-3xl sm:text-4xl font-bold text-primary font-mono tabular-nums">
                  ${prizePot.toLocaleString()}
                </span>
              </div>
              {(pool.created_by === user?.id ||
                user?.app_metadata?.role === "admin" ||
                user?.role === "admin") && (
                <div className="flex flex-wrap gap-2">
                  {pool.can_edit &&
                    pool.created_by === user?.id && (
                      <button
                        type="button"
                        onClick={() => setIsEditModalOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit pool
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => syncPoolGamesMutation.mutate()}
                    disabled={syncPoolGamesMutation.isPending}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50"
                  >
                    {syncPoolGamesMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Sync scores
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {isConfirmingPayment ? (
              <div className="glass-panel p-6 rounded-xl text-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                <p className="text-muted-foreground">
                  Confirming your payment…
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your card(s) will appear here in a moment.
                </p>
              </div>
            ) : isLoadingCards ? (
              <div className="glass-panel p-4 rounded-xl space-y-3" aria-hidden="true">
                <div className="skeleton h-6 w-32" />
                <div className="skeleton h-16" />
                <div className="skeleton h-16" />
              </div>
            ) : cards.length > 0 ? (
              <div className="glass-panel p-4 rounded-xl">
                <CardSelectorComponent
                  cards={cards}
                  selectedCardId={effectiveCardId}
                  onSelectCard={setSelectedCardId}
                  onPurchaseNew={() => {
                    document.getElementById("purchase-card-trigger")?.click();
                  }}
                  entryFee={entryFee}
                />
              </div>
            ) : (
              <div className="glass-panel p-6 rounded-xl text-center">
                <p className="text-muted-foreground mb-4">
                  Purchase a card to start making picks
                </p>
                <CardPurchaseButton
                  poolId={poolId}
                  entryFee={entryFee}
                  onPurchaseSuccess={handlePurchaseSuccess}
                  disabled={isConfirmingPayment}
                />
              </div>
            )}

            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-2xl font-bold font-display uppercase italic">
                {effectiveCardId
                  ? `Card ${selectedCard?.card_number || ""} - `
                  : ""}
                Week {pool.week} Matchups
              </h2>
              {isCardLocked && (
                <span className="text-sm text-primary font-medium">
                  Picks locked
                </span>
              )}
            </div>

            {poolGames.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  No games selected for this pool yet.
                </p>
              </div>
            ) : effectiveCardId ? (
              <div className="grid grid-cols-1 gap-6">
                {poolGames.map((game) => {
                  const pick = effectivePicks[game.id];
                  const selectedPrediction = pick?.prediction as string | undefined;
                  const gameResult =
                    isPoolCompleted && selectedPrediction
                      ? getGameResult(game, selectedPrediction)
                      : null;

                  return (
                    <div key={game.id} className="min-h-[240px]">
                      <GameCard
                        game={game as unknown as GameCardProps["game"]}
                        disabled={isCardLocked}
                        onPick={(teamIdOrTie) => {
                          const prediction: GamePrediction | undefined =
                            teamIdOrTie === "tie"
                              ? "tie"
                              : teamIdOrTie === game.home_team_id
                              ? "home_win"
                              : teamIdOrTie === game.away_team_id
                              ? "away_win"
                              : undefined;
                          if (prediction) {
                            handlePick(game.id, prediction);
                          }
                        }}
                        selectedTeamId={
                          selectedPrediction === "home_win"
                            ? game.home_team_id
                            : selectedPrediction === "away_win"
                            ? game.away_team_id
                            : undefined
                        }
                        selectedPrediction={
                          selectedPrediction === "home_win" ||
                          selectedPrediction === "away_win" ||
                          selectedPrediction === "tie"
                            ? selectedPrediction
                            : undefined
                        }
                        gameResult={gameResult}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 glass-panel rounded-xl">
                <p className="text-muted-foreground">
                  Select a card to make picks
                </p>
              </div>
            )}

            {effectiveCardId && (
              <div className="space-y-4">
                {canSubmitPicks && (
                  <button
                    type="button"
                    onClick={handleSubmitPicks}
                    disabled={
                      submitCardPickMutation.isPending ||
                      lockCardMutation.isPending
                    }
                    className="w-full py-3 px-4 rounded-xl font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  >
                    {submitCardPickMutation.isPending ||
                    lockCardMutation.isPending
                      ? "Submitting…"
                      : "Submit picks"}
                  </button>
                )}
                {isPoolCompleted && selectedCard?.status === "pending" && (
                  <div className="glass-panel p-4 rounded-xl text-center text-sm text-muted-foreground">
                    Pool is closed. Picks can no longer be submitted.
                  </div>
                )}
                {isCardLocked && (
                  <div className="glass-panel p-4 rounded-xl text-center text-sm text-muted-foreground">
                    Picks are locked. You can’t change them for this card.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-6">
            {effectiveCardId && (
              <ProgressCard
                picksMade={Object.keys(effectivePicks).length}
                totalGames={poolGames.length}
              />
            )}

            {pool.type === "private" &&
              pool.created_by === user?.id && (
                <PoolInviteByEmail
                  poolId={poolId}
                  onSuccess={() => {
                    queryClient.invalidateQueries({
                      queryKey: ["/api/pools", poolId],
                    });
                    toast.success(
                      "Invites sent. They’ll see them under Invitations."
                    );
                  }}
                />
              )}

            {cards.length > 0 && cards.length < 3 && (
              <div className="glass-panel p-4 rounded-xl">
                <CardPurchaseButton
                  poolId={poolId}
                  entryFee={entryFee}
                  onPurchaseSuccess={handlePurchaseSuccess}
                  disabled={isConfirmingPayment}
                />
              </div>
            )}

            <CommentSection
              comments={comments.map((c: PoolCommentRow) => ({
                id: c.id,
                userId: c.user_id,
                text: c.text,
                timestamp: c.created_at,
                user: c.users,
              }))}
              onAddComment={handleAddComment}
              isLoading={isLoadingComments}
              isPosting={addCommentMutation.isPending}
              requiresCard={requiresCard}
              currentUserId={user?.id}
              onPurchaseCard={() => {
                document.getElementById("purchase-card-trigger")?.click();
              }}
            />
          </div>
        </div>
      </div>

      {isEditModalOpen && pool && (
        <PoolEditModal
          pool={pool}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleEditPoolSave}
          isSaving={updatePoolMutation.isPending}
        />
      )}
    </Layout>
  );
}
