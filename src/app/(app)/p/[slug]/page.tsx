"use client";

import Layout from "@/components/layout";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Lock, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

/**
 * Share-link landing page: /p/<slug>.
 *
 * Public pool, or already a member  → straight to the pool.
 * Private with a password           → password form, then in.
 * Private, invite-only              → explain, offer sign-in / dashboard.
 */
type SlugResponse = {
  pool: {
    id: string;
    name: string;
    type: string;
    status: string;
    entryFee: number;
    week: number;
    sport: string;
    startsAt: string | null;
    endsAt: string | null;
  };
  signedIn: boolean;
  isParticipant: boolean;
  requiresPassword: boolean;
  canEnter: boolean;
  closed: boolean;
};

export default function SharedPoolPage() {
  const params = useParams();
  const router = useRouter();
  const slug = String(params?.slug ?? "");
  const [password, setPassword] = useState("");
  const [joining, setJoining] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/pools/by-slug", slug],
    enabled: slug.length > 0,
    retry: false,
    queryFn: async (): Promise<SlugResponse> => {
      const res = await fetch(`/api/pools/by-slug/${encodeURIComponent(slug)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("This link does not point to a pool");
      return res.json();
    },
  });

  useEffect(() => {
    if (data?.canEnter) router.replace(`/pool/${data.pool.id}`);
  }, [data, router]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !password) return;
    setJoining(true);
    try {
      await apiRequest("POST", `/api/pools/${data.pool.id}/access`, { password });
      toast.success("You're in! Welcome to the pool.");
      router.replace(`/pool/${data.pool.id}`);
    } catch (err) {
      const message = (err as Error | null)?.message ?? "";
      toast.error(
        message.includes("Incorrect") ? "Incorrect password" : message || "Could not join the pool"
      );
    } finally {
      setJoining(false);
    }
  };

  if (isLoading || data?.canEnter) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="max-w-md mx-auto text-center py-24 space-y-4">
          <h1 className="text-3xl font-black font-display italic uppercase">Link not found</h1>
          <p className="text-muted-foreground">
            This share link doesn&apos;t point to a pool. Ask the pool owner for a fresh one.
          </p>
          <Link href="/public-pools" className="btn-3d-primary inline-flex px-6 py-2 text-sm">
            Browse public pools
          </Link>
        </div>
      </Layout>
    );
  }

  const { pool } = data;

  return (
    <Layout>
      <div className="max-w-md mx-auto py-12 space-y-6">
        <div className="glass-panel rounded-2xl p-8 space-y-4">
          <span className="inline-block px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {pool.type} pool · week {pool.week}
          </span>
          <h1 className="text-3xl font-black font-display italic uppercase break-words">{pool.name}</h1>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Trophy className="w-4 h-4 text-yellow-500" /> ${pool.entryFee} entry
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" /> {pool.status}
            </span>
          </div>

          {data.closed ? (
            <p className="text-sm text-muted-foreground">This pool is no longer accepting players.</p>
          ) : !data.signedIn ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Sign in or create an account to join this pool.</p>
              <div className="flex gap-2">
                <Link
                  href={`/login?next=${encodeURIComponent(`/p/${slug}`)}`}
                  className="btn-3d-primary flex-1 text-center px-4 py-2 text-sm"
                >
                  Log in
                </Link>
                <Link
                  href={`/signup?next=${encodeURIComponent(`/p/${slug}`)}`}
                  className="flex-1 text-center px-4 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/10"
                >
                  Sign up
                </Link>
              </div>
            </div>
          ) : data.requiresPassword ? (
            <form onSubmit={submitPassword} className="space-y-3">
              <label htmlFor="pool-password" className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-2">
                <Lock className="w-3 h-3" /> Pool password
              </label>
              <input
                id="pool-password"
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={128}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Enter the password the owner shared"
              />
              <button
                type="submit"
                disabled={!password || joining}
                className="btn-3d-primary w-full py-3 text-sm disabled:opacity-50"
              >
                {joining ? "Joining…" : "Join pool"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              This is an invite-only pool. Ask the owner to invite your account email, then check your
              <Link href="/invitations" className="text-primary underline ml-1">invitations</Link>.
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
}
