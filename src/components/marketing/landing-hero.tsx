"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, Trophy, Users } from "lucide-react";
import { FeaturedPoolCard } from "@/components/home/featured-pool-card";
import { Button } from "@/components/ui/button";
import { DASHBOARD_PATH } from "@/lib/routes";
import type { Pool } from "@/lib/types";

type LandingHeroProps = {
  featuredPool?: Pool | null;
  publicPoolsCount: number;
  upcomingGamesCount: number;
};

export function LandingHero({
  featuredPool,
  publicPoolsCount,
  upcomingGamesCount,
}: LandingHeroProps) {
  const stats = [
    {
      label: "Public Pools",
      value: String(publicPoolsCount),
      icon: Users,
    },
    {
      label: "Upcoming Games",
      value: String(upcomingGamesCount),
      icon: ShieldCheck,
    },
    {
      label: "Featured Pot",
      value: `$${(featuredPool?.prize_pot ?? featuredPool?.prizePot ?? 0).toLocaleString()}`,
      icon: Trophy,
    },
  ];

  return (
    <section className="relative overflow-hidden border-b border-white/10">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.25),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.08),_transparent_30%)]" />
        <img
          src="/generated_images/abstract_red_neon_stadium_background.png"
          alt=""
          className="h-full w-full object-cover opacity-15"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/82 to-background" />
      </div>

      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-center lg:px-8 lg:py-24">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            NFL Pools For 2026 Season
          </div>

          <div className="space-y-5">
            <h1 className="max-w-4xl text-5xl font-black italic leading-[0.95] sm:text-6xl lg:text-7xl">
              Build hype before kickoff and keep every pick alive.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Run public or private NFL pools, invite your league, track live
              action, and turn every slate into a shared event.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="min-h-12 px-6 text-sm font-semibold uppercase">
              <Link href="/signup">
                Create Your Account
                <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="min-h-12 px-6 text-sm font-semibold uppercase"
            >
              <Link href="/public-pools">Browse Public Pools</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="min-h-12 px-6 text-sm font-semibold uppercase"
            >
              <Link href={DASHBOARD_PATH}>Preview Dashboard</Link>
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-md"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="text-2xl font-black text-white">{stat.value}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 rounded-[2rem] bg-primary/10 blur-3xl" />
          <div className="relative rounded-[2rem] border border-white/10 bg-black/40 p-4 backdrop-blur-xl">
            <FeaturedPoolCard pool={featuredPool} />
          </div>
        </div>
      </div>
    </section>
  );
}
