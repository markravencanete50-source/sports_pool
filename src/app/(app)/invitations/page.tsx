"use client";

import Layout from "@/components/layout";
import { Mail, Loader2, Check, X } from "lucide-react";
import Link from "next/link";
import { StaggerGroup, StaggerItem } from "@/components/motion/reveal";
import { useInvitations, useAcceptInvitation, useDeclineInvitation } from "@/lib/hooks/use-invitations";
import { toast } from "sonner";

type Invitation = {
  id: string;
  status: string;
  pools?: { id?: string; name?: string; entry_fee?: number } | null;
  inviter?: { name?: string | null; email?: string | null } | null;
};

export default function InvitationsPage() {
  const { data: invitations = [], isLoading, error } = useInvitations();
  const acceptMutation = useAcceptInvitation();
  const declineMutation = useDeclineInvitation();

  const pending = invitations.filter(
    (i: Invitation) => i.status === "pending"
  );

  const handleAccept = async (id: string) => {
    try {
      await acceptMutation.mutateAsync(id);
      toast.success("Invitation accepted! You can now join the pool.");
    } catch (e) {
      toast.error((e as Error | null)?.message ?? "Failed to accept");
    }
  };

  const handleDecline = async (id: string) => {
    try {
      await declineMutation.mutateAsync(id);
      toast.success("Invitation declined.");
    } catch (e) {
      toast.error((e as Error | null)?.message ?? "Failed to decline");
    }
  };

  if (error) {
    return (
      <Layout>
        <div className="space-y-8">
          <h1 className="text-3xl font-black font-display italic uppercase">
            Invitations
          </h1>
          <div className="text-center py-12">
            <p className="text-destructive">
              Failed to load invitations. Please try again.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-black font-display italic uppercase mb-2">
            Invitations
          </h1>
          <p className="text-muted-foreground">
            Pool invites sent to you. Accept to join and buy a card.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-24" />
            ))}
          </div>
        ) : pending.length === 0 ? (
          <div className="glass-panel rounded-xl p-12 text-center">
            <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">
              No pending invitations
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              When someone invites you to a private pool, it will show here.
            </p>
          </div>
        ) : (
          <StaggerGroup className="grid grid-cols-1 gap-4">
            {pending.map((inv: Invitation) => {
              const pool = inv.pools;
              const inviter = inv.inviter;
              const poolName = pool?.name ?? "Private pool";
              const entryFee = pool?.entry_fee ?? 20;
              const inviterName = inviter?.name ?? inviter?.email ?? "Someone";

              return (
                <StaggerItem
                  key={inv.id}
                  className="glass-panel rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors duration-300 hover:border-primary/30"
                >
                  <div>
                    <h2 className="font-bold text-lg">{poolName}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {inviterName} invited you · Entry ${entryFee}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleAccept(inv.id)}
                      disabled={
                        acceptMutation.isPending || declineMutation.isPending
                      }
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
                    >
                      {acceptMutation.isPending &&
                      acceptMutation.variables === inv.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecline(inv.id)}
                      disabled={
                        acceptMutation.isPending || declineMutation.isPending
                      }
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/20 bg-transparent font-medium hover:bg-white/10 disabled:opacity-50"
                    >
                      {declineMutation.isPending &&
                      declineMutation.variables === inv.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                      Decline
                    </button>
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerGroup>
        )}

        {invitations.some((i: Invitation) => i.status !== "pending") && (
          <div className="pt-8 border-t border-white/10">
            <h2 className="text-lg font-bold mb-4">Past invitations</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {invitations
                .filter((i: Invitation) => i.status !== "pending")
                .map((inv: Invitation) => (
                  <li key={inv.id} className="flex items-center gap-2">
                    <span>
                      {inv.pools?.name ?? "Pool"} —{" "}
                      {inv.status === "accepted" ? "Accepted" : "Declined"}
                    </span>
                    {inv.status === "accepted" && inv.pools?.id && (
                      <Link
                        href={`/pool/${inv.pools.id}`}
                        className="text-primary hover:underline"
                      >
                        Open pool
                      </Link>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </Layout>
  );
}
