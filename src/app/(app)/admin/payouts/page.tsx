"use client";

import Layout from "@/components/layout";
import { useAuth } from "@/lib/hooks/use-auth";
import { useRouter } from "next/navigation";
import { DASHBOARD_PATH } from "@/lib/routes";
import { useEffect, useState, useMemo } from "react";
import { Loader2, DollarSign, CheckCircle, Search } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export default function AdminPayoutsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoadingUser } = useAuth();

  const isAdmin =
    (user as any)?.app_metadata?.role === "admin" ||
    (user as any)?.role === "admin";

  useEffect(() => {
    if (!isLoadingUser && !isAdmin && user !== undefined) {
      router.replace(DASHBOARD_PATH);
    }
  }, [isLoadingUser, isAdmin, user, router]);

  const {
    data: payoutsData,
    isLoading: isLoadingPayouts,
    error: payoutsError,
  } = useQuery({
    queryKey: ["/api/admin/payout-requests"],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/payout-requests");
      if (!res.ok) throw new Error("Failed to fetch payout requests");
      return res.json();
    },
  });

  const [searchTerm, setSearchTerm] = useState("");

  const completePayoutMutation = useMutation({
    mutationFn: async (payoutRequestId: string) => {
      const res = await apiRequest(
        "PATCH",
        `/api/admin/payout-requests/${payoutRequestId}/complete`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to complete payout");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/payout-requests"],
      });
      toast.success("Payout completed");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const payoutRequests = payoutsData?.payoutRequests ?? [];
  const searchLower = searchTerm.trim().toLowerCase();
  const filteredPayoutRequests = useMemo(() => {
    if (!searchLower) return payoutRequests;
    return payoutRequests.filter((req: any) => {
      const name = (req.users?.name ?? "").toString().toLowerCase();
      const email = (req.users?.email ?? "").toString().toLowerCase();
      return name.includes(searchLower) || email.includes(searchLower);
    });
  }, [payoutRequests, searchLower]);

  if (isLoadingUser || (!isAdmin && user !== undefined)) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-4xl font-black font-display italic uppercase mb-2 flex items-center gap-2">
              <DollarSign className="w-10 h-10 text-primary" />
              Payouts
            </h1>
            <p className="text-muted-foreground">
              Process payout requests. Pool winnings are approved automatically
              when a pool completes.
            </p>
          </div>
          <div className="relative w-full md:w-64 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by user..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {payoutsError ? (
          <div className="text-center py-12">
            <p className="text-destructive">
              {(payoutsError as Error).message}
            </p>
          </div>
        ) : (
          <section>
            <p className="text-sm text-muted-foreground mb-4">
              After sending funds (e.g. via Revolut/PayPal), mark as complete to
              deduct from user balance.
            </p>
            {isLoadingPayouts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredPayoutRequests.length === 0 ? (
              <div className="glass-panel rounded-xl p-6 text-center text-muted-foreground text-sm">
                {payoutRequests.length === 0
                  ? "No payout requests yet."
                  : "No payout requests match your search."}
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 overflow-x-auto custom-scrollbar">
                <table className="w-full min-w-[640px] text-left">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                        User
                      </th>
                      <th className="px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                        Source
                      </th>
                      <th className="px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                        Status
                      </th>
                      <th className="px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                        Requested
                      </th>
                      <th className="px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayoutRequests.map((req: any) => (
                      <tr
                        key={req.id}
                        className="border-b border-white/5 hover:bg-white/5"
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium">
                            {req.users?.name ?? "—"}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {req.users?.email ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {req.pools?.name ?? "Balance"}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          ${Number(req.amount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded ${
                              req.status === "completed"
                                ? "bg-green-500/20 text-green-500"
                                : req.status === "failed"
                                  ? "bg-red-500/20 text-red-500"
                                  : "bg-yellow-500/20 text-yellow-500"
                            }`}
                          >
                            {req.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(req.created_at), {
                            addSuffix: true,
                          })}
                        </td>
                        <td className="px-4 py-3">
                          {req.status === "pending" ? (
                            <button
                              type="button"
                              onClick={() =>
                                completePayoutMutation.mutate(req.id)
                              }
                              disabled={completePayoutMutation.isPending}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                            >
                              {completePayoutMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle className="w-4 h-4" />
                              )}
                              Mark complete
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}
