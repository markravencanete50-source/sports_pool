"use client";

import Layout from "@/components/layout";
import { MyGamesPageHeader } from "@/components/pools/my-games-page-header";
import {
  usePayoutRequests,
  useRequestPayout,
} from "@/lib/hooks/use-payout-request";
import { usePayoutAccount } from "@/lib/hooks/use-payout-account";
import { useBalance } from "@/lib/hooks/use-balance";
import { useAuth } from "@/lib/hooks/use-auth";
import { MINIMUM_PAYOUT_AMOUNT } from "@/lib/constants";
import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import {
  Loader2,
  Wallet,
  X,
  DollarSign,
  Send,
  Trophy,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const SEARCH_DEBOUNCE_MS = 300;

export default function WithdrawalsPage() {
  const router = useRouter();
  const { isLoadingUser, isAuthenticated } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showPayoutAccountModal, setShowPayoutAccountModal] = useState(false);
  const [paypalEmail, setPaypalEmail] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");

  const { data: balanceData } = useBalance({
    enabled: isAuthenticated ?? false,
    includeTransactions: true,
  });
  const balance = balanceData?.balance ?? 0;
  const pendingClaims = (balanceData?.pendingClaims ?? []) as {
    pool_id: string;
    pool_name: string;
    amount: number;
  }[];
  const transactions = (balanceData?.transactions ?? []) as {
    amount: number;
    type: string;
    created_at: string;
    final_balance: number;
  }[];
  const canRequestPayout = balance >= MINIMUM_PAYOUT_AMOUNT;

  const {
    payoutAccount,
    isLoading: isLoadingPayoutAccount,
    isSaving: isSavingAccount,
    savePayoutAccount,
  } = usePayoutAccount({ enabled: isAuthenticated ?? false });

  const requestPayoutMutation = useRequestPayout();

  const { data: payoutRequests = [] } = usePayoutRequests({
    enabled: isAuthenticated ?? false,
  });

  const completedWithdrawn = useMemo(() => {
    const list = payoutRequests as { amount: number; status: string }[];
    return list
      .filter((r) => r.status === "completed")
      .reduce((sum, r) => sum + Number(r.amount), 0);
  }, [payoutRequests]);

  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedSearch(searchTerm),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    if (!isLoadingUser && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoadingUser, isAuthenticated, router]);

  const searchLower = debouncedSearch.trim().toLowerCase();
  const filteredTransactions = useMemo(() => {
    if (!searchLower) return transactions;
    return transactions.filter((tx) => {
      const typeLabel =
        tx.type === "winning_approved"
          ? "winning claimed"
          : tx.type === "payout"
          ? "withdrawal paypal"
          : tx.type;
      const amountStr = tx.amount.toFixed(2);
      return (
        typeLabel.includes(searchLower) ||
        amountStr.includes(searchLower) ||
        (tx.amount >= 0 && "winning".includes(searchLower)) ||
        (tx.amount < 0 && "withdrawal".includes(searchLower))
      );
    });
  }, [transactions, searchLower]);

  const handleSavePayoutAccount = async () => {
    const email = paypalEmail.trim();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid PayPal email");
      return;
    }
    try {
      await savePayoutAccount(email);
      setShowPayoutAccountModal(false);
      setPaypalEmail("");
    } catch {
      toast.error("Failed to save payout account");
    }
  };

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
      setShowPayoutAccountModal(true);
      return;
    }
    requestPayoutMutation.mutate(amount, {
      onSuccess: () => setPayoutAmount(""),
      onError: (err: Error & { code?: string }) => {
        if (err.code === "PAYOUT_ACCOUNT_REQUIRED")
          setShowPayoutAccountModal(true);
      },
    });
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

  return (
    <Layout>
      <div className="space-y-5">
        <MyGamesPageHeader
          title="Withdrawals"
          description="Balance, payout account, and history."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search transactions..."
          rightElement={
            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="font-mono font-bold text-primary">
                ${balance.toFixed(2)}
              </span>
            </div>
          }
        />

        <div className="glass-panel rounded-xl p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-xl font-bold text-primary">
                ${balance.toFixed(2)}
              </span>
              <span className="text-sm text-muted-foreground">
                min ${MINIMUM_PAYOUT_AMOUNT}
              </span>
              {completedWithdrawn > 0 && (
                <span className="text-sm text-muted-foreground">
                  · Sent to PayPal: ${completedWithdrawn.toFixed(2)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isLoadingPayoutAccount ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : payoutAccount?.hasAccount ? (
                <>
                  <span className="text-sm text-muted-foreground">
                    PayPal: {payoutAccount.identifierMasked}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPaypalEmail("");
                      setShowPayoutAccountModal(true);
                    }}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Change
                  </button>
                  <input
                    type="number"
                    min={MINIMUM_PAYOUT_AMOUNT}
                    max={balance}
                    step="0.01"
                    placeholder={`$${MINIMUM_PAYOUT_AMOUNT}+`}
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    className="w-24 bg-black/20 border border-white/10 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={handleRequestPayout}
                    disabled={
                      requestPayoutMutation.isPending ||
                      !canRequestPayout ||
                      !payoutAccount?.hasAccount
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 text-sm disabled:opacity-50"
                  >
                    {requestPayoutMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Withdraw
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPayoutAccountModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 text-sm"
                >
                  <Wallet className="w-4 h-4" />
                  Connect PayPal
                </button>
              )}
            </div>
          </div>
          {!isLoadingPayoutAccount && !payoutAccount?.hasAccount && (
            <p className="text-xs text-muted-foreground mt-3">
              Connect PayPal first to request a payout.
            </p>
          )}
        </div>

        {pendingClaims.length > 0 && (
          <div className="glass-panel rounded-xl p-4 sm:p-5 border border-primary/20">
            <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-primary" />
              Approved winnings — claim to add to balance
            </h2>
            <p className="text-sm text-muted-foreground mb-3">
              Admin has approved these payouts. Claim them in My Games to add
              the amount to your balance, then you can withdraw to PayPal.
            </p>
            <ul className="space-y-2 mb-4">
              {pendingClaims.map((c) => (
                <li
                  key={c.pool_id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0"
                >
                  <span className="text-sm text-muted-foreground">
                    {c.pool_name}
                  </span>
                  <span className="text-green-500 font-mono font-medium">
                    +${c.amount.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/my-games"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              Go to My Games to claim
            </Link>
          </div>
        )}

        <h2 className="text-base font-semibold">Transaction history</h2>

        {filteredTransactions.length === 0 ? (
          <div className="glass-panel rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {transactions.length === 0
                ? "No transactions yet. Winnings and withdrawals will appear here."
                : "No transactions match your search."}
            </p>
          </div>
        ) : (
          <div className="glass-panel rounded-xl p-4 sm:p-6">
            <ul className="space-y-2">
              {filteredTransactions.map((tx, i) => {
                const dateStr = tx.created_at
                  ? new Date(tx.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—";
                const label =
                  tx.type === "winning_approved"
                    ? "Winning claimed"
                    : tx.type === "payout"
                    ? "Withdrawal sent to PayPal"
                    : tx.type;
                return (
                  <li
                    key={tx.created_at ? `${tx.created_at}-${i}` : i}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0"
                  >
                    <span className="text-sm text-muted-foreground">
                      {label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {dateStr}
                      </span>
                      <span
                        className={
                          tx.amount >= 0
                            ? "text-green-500 font-mono font-medium"
                            : "text-red-500 font-mono font-medium"
                        }
                      >
                        {tx.amount >= 0 ? "+" : ""}${tx.amount.toFixed(2)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {showPayoutAccountModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
            <div className="glass-panel rounded-xl border border-white/10 p-6 w-full max-w-md shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-primary" />
                  {payoutAccount?.hasAccount
                    ? "Change payout account"
                    : "Connect PayPal"}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowPayoutAccountModal(false);
                    setPaypalEmail("");
                  }}
                  className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Payouts will be sent to this PayPal account. Use the email
                linked to your PayPal.
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
                    setShowPayoutAccountModal(false);
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
