"use client";

import Layout from "@/components/layout";
import { MyGamesPageHeader } from "@/components/pools/my-games-page-header";
import { Pagination } from "@/components/pools/pagination";
import { useMeGames } from "@/lib/hooks/use-me-games";
import { useBalance } from "@/lib/hooks/use-balance";
import {
  useRequestPayout,
  usePayoutRequests,
  useClaimPayout,
} from "@/lib/hooks/use-payout-request";
import { usePayoutAccount } from "@/lib/hooks/use-payout-account";
import { useAuth } from "@/lib/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Loader2,
  Gamepad2,
  DollarSign,
  Target,
  ArrowRight,
  Send,
  CheckCircle,
  X,
  Wallet,
  History,
} from "lucide-react";
import { Card3D } from "@/components/ui/3d-card";
import { MyGamesOutcomeFilter } from "@/lib/enums";
import { MINIMUM_PAYOUT_AMOUNT } from "@/lib/constants";
import { toast } from "sonner";

const SEARCH_DEBOUNCE_MS = 400;
const PAGE_SIZE = 12;

function getMyGamesEmptyMessage(
  outcomeFilter: MyGamesOutcomeFilter,
  hasSearch: boolean
): string {
  if (hasSearch && outcomeFilter !== MyGamesOutcomeFilter.ALL) {
    return "No games match your search and filter. Try different keywords or filters.";
  }
  if (hasSearch) {
    return "No games match your search. Try different keywords.";
  }
  if (outcomeFilter === MyGamesOutcomeFilter.WON) {
    return "No won games yet. Complete pools and finish at the top.";
  }
  if (outcomeFilter === MyGamesOutcomeFilter.LOST) {
    return "No lost games. Keep playing.";
  }
  if (outcomeFilter === MyGamesOutcomeFilter.PENDING) {
    return "No pending games. Join a pool to get started.";
  }
  return "No games yet. Join a pool to get started.";
}

export default function MyGamesPage() {
  const router = useRouter();
  const { isLoadingUser, isAuthenticated } = useAuth();
  const requestPayoutMutation = useRequestPayout();
  const claimPayoutMutation = useClaimPayout();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<MyGamesOutcomeFilter>(
    MyGamesOutcomeFilter.ALL
  );
  const [page, setPage] = useState(1);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [showLinkPayoutModal, setShowLinkPayoutModal] = useState(false);
  const [paypalEmail, setPaypalEmail] = useState("");

  const {
    payoutAccount,
    isLoading: isLoadingPayoutAccount,
    isSaving: isSavingAccount,
    savePayoutAccount,
  } = usePayoutAccount({ enabled: isAuthenticated ?? false });

  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedSearch(searchTerm),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, outcomeFilter]);

  const { data, isLoading, error } = useMeGames(
    {
      search: debouncedSearch,
      outcome: outcomeFilter,
      page,
      limit: PAGE_SIZE,
    },
    { enabled: isAuthenticated ?? false }
  );

  const { data: balanceData } = useBalance({
    enabled: isAuthenticated ?? false,
  });

  const { data: payoutRequests = [] } = usePayoutRequests({
    enabled: isAuthenticated ?? false,
  });

  const balance = balanceData?.balance ?? 0;
  const canRequestPayout = balance >= MINIMUM_PAYOUT_AMOUNT;
  const pendingPayoutCount = (payoutRequests as { status: string }[]).filter(
    (r) => r.status === "pending"
  ).length;

  useEffect(() => {
    if (!isLoadingUser && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoadingUser, isAuthenticated, router]);

  const handleRequestPayout = () => {
    const amount = parseFloat(payoutAmount);
    if (!Number.isFinite(amount) || amount < MINIMUM_PAYOUT_AMOUNT) {
      toast.error(`Minimum payout is $${MINIMUM_PAYOUT_AMOUNT}`);
      return;
    }
    if (amount > balance) {
      toast.error("Insufficient balance");
      return;
    }
    if (!payoutAccount?.hasAccount) {
      setShowLinkPayoutModal(true);
      return;
    }
    requestPayoutMutation.mutate(amount, {
      onSuccess: () => setPayoutAmount(""),
      onError: (err: Error & { code?: string }) => {
        if (err.code === "PAYOUT_ACCOUNT_REQUIRED") {
          setShowLinkPayoutModal(true);
        }
      },
    });
  };

  const handleSavePayoutAccount = async () => {
    const email = paypalEmail.trim();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid PayPal email");
      return;
    }
    try {
      await savePayoutAccount(email);
      setShowLinkPayoutModal(false);
      setPaypalEmail("");
    } catch {}
  };

  if (isLoadingUser || !isAuthenticated) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const games = data?.games ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <Layout>
      <div className="space-y-8">
        <MyGamesPageHeader
          title="My Games"
          description="Pools you have staked on. Filter by outcome and search by name."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          outcomeFilter={outcomeFilter}
          onOutcomeFilterChange={setOutcomeFilter}
          rightElement={
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg">
                <DollarSign className="w-4 h-4 text-primary" />
                <span className="font-mono font-bold text-primary">
                  ${balance.toFixed(2)}
                </span>
              </div>
              {!isLoadingPayoutAccount && !payoutAccount?.hasAccount && (
                <button
                  type="button"
                  onClick={() => setShowLinkPayoutModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/50 text-primary font-medium hover:bg-primary/10 text-sm"
                >
                  <Wallet className="w-4 h-4" />
                  Link PayPal to receive payouts
                </button>
              )}
              {canRequestPayout &&
                (isLoadingPayoutAccount || payoutAccount?.hasAccount) && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={MINIMUM_PAYOUT_AMOUNT}
                      max={balance}
                      step="0.01"
                      aria-label="Payout amount"
                      placeholder={`Min $${MINIMUM_PAYOUT_AMOUNT}`}
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      className="flex-1 min-w-0 sm:flex-none sm:w-28 bg-black/20 border border-white/10 rounded-lg px-2 py-2 min-h-10 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={handleRequestPayout}
                      disabled={requestPayoutMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-2 min-h-10 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 active:scale-[0.98] transition-all text-sm disabled:opacity-50 shrink-0"
                    >
                      {requestPayoutMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Request payout
                    </button>
                  </div>
                )}
              {!isLoadingPayoutAccount && payoutAccount?.hasAccount && (
                <Link
                  href="/my-games/withdrawals"
                  className="text-sm text-muted-foreground hover:text-primary hover:underline"
                >
                  Manage payout account
                </Link>
              )}
            </div>
          }
        />

        {pendingPayoutCount > 0 && (
          <p className="text-sm text-muted-foreground">
            You have {pendingPayoutCount} pending payout request(s). Admin will
            process shortly.{" "}
            <Link
              href="/my-games/withdrawals"
              className="text-primary hover:underline font-medium"
            >
              View withdrawal history
            </Link>
          </p>
        )}

        {payoutRequests.length > 0 && pendingPayoutCount === 0 && (
          <p className="text-sm text-muted-foreground">
            <Link
              href="/my-games/withdrawals"
              className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
            >
              <History className="w-4 h-4" />
              View withdrawal history
            </Link>
          </p>
        )}

        {error ? (
          <div className="text-center py-12">
            <p className="text-destructive">{(error as Error).message}</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : games.length === 0 ? (
          <div className="glass-panel rounded-xl p-12 text-center">
            <Gamepad2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No games yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              {getMyGamesEmptyMessage(
                outcomeFilter,
                debouncedSearch.length > 0
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {games.map((g: any) => (
                <Card3D key={g.poolId} intensity={5} className="h-full">
                  <div className="h-full glass-panel p-6 rounded-xl flex flex-col gap-4 hover:border-primary/50 hover:shadow-[0_0_25px_rgba(220,20,60,0.12)] transition-all duration-300 group relative overflow-hidden">
                    <div className="absolute -right-8 -top-8 w-32 h-32 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all" />

                    <div className="relative z-10 flex justify-between items-start">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-mono uppercase tracking-widest ${
                          g.outcome === "won"
                            ? "bg-green-500/20 text-green-500 border border-green-500/30"
                            : g.outcome === "lost"
                            ? "bg-red-500/20 text-red-500 border border-red-500/30"
                            : "bg-white/5 border border-white/10 text-muted-foreground"
                        }`}
                      >
                        {g.outcome}
                      </span>
                      {g.pendingApproval && (
                        <span className="text-xs font-medium px-2 py-1 rounded bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">
                          Pending approval
                        </span>
                      )}
                      {g.claimed && (
                        <span className="text-xs font-medium px-2 py-1 rounded bg-green-500/20 text-green-500 border border-green-500/30">
                          Claimed
                        </span>
                      )}
                    </div>

                    <Link
                      href={`/pool/${g.poolId}`}
                      className="relative z-10 block group/link"
                    >
                      <h3 className="text-xl font-bold truncate pr-2 group-hover/link:text-primary transition-colors">
                        {g.poolName}
                      </h3>
                    </Link>

                    <div className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-3 py-3 border-y border-white/5 justify-between">
                      {(g.correct != null && g.total != null) ||
                      g.amount != null ? (
                        <>
                          {g.correct != null && g.total != null && (
                            <div className="flex items-center gap-2">
                              <Target className="w-4 h-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Your picks
                                </p>
                                <p className="font-mono font-bold">
                                  {g.correct} / {g.total}
                                </p>
                              </div>
                            </div>
                          )}
                          {g.amount != null && (
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4 text-primary" />
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Amount
                                </p>
                                <p className="font-mono font-bold text-primary">
                                  ${Number(g.amount).toFixed(2)}
                                </p>
                              </div>
                            </div>
                          )}
                          {g.correct != null &&
                            g.total != null &&
                            g.amount == null && (
                              <div className="flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-muted-foreground" />
                                <div>
                                  <p className="text-xs text-muted-foreground">
                                    Entry
                                  </p>
                                  <p className="font-mono font-bold">
                                    ${Number(g.entryFee ?? 0).toFixed(2)}
                                  </p>
                                </div>
                              </div>
                            )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Entry
                            </p>
                            <p className="font-mono font-bold">
                              ${Number(g.entryFee ?? 0).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="relative z-10 mt-auto flex items-center justify-between gap-2">
                      <Link
                        href={`/pool/${g.poolId}`}
                        className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        View pool <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                      {g.claimable && (
                        <button
                          type="button"
                          onClick={() => claimPayoutMutation.mutate(g.poolId)}
                          disabled={claimPayoutMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                        >
                          {claimPayoutMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5" />
                          )}
                          Claim payout
                        </button>
                      )}
                    </div>
                  </div>
                </Card3D>
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={PAGE_SIZE}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          </>
        )}

        {showLinkPayoutModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="glass-panel rounded-xl border border-white/10 p-6 w-full max-w-md max-h-[85dvh] overflow-y-auto shadow-xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-primary" />
                  Link PayPal to receive payouts
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkPayoutModal(false);
                    setPaypalEmail("");
                  }}
                  className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                When admin approves your payout, the amount will be sent to this
                PayPal account. Use the email linked to your PayPal.
              </p>
              <input
                type="email"
                placeholder="your@email.com"
                value={paypalEmail}
                onChange={(e) => setPaypalEmail(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary mb-4"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkPayoutModal(false);
                    setPaypalEmail("");
                  }}
                  className="px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePayoutAccount}
                  disabled={isSavingAccount}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingAccount ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
