"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { LiveActionTicker } from "@/components/home/live-action-ticker";
import { WinnersSection } from "@/components/home/winners-section";
import { BackgroundLayer } from "@/components/layout/background-layer";
import { LandingFooter } from "@/components/marketing/landing-footer";
import { LandingHero } from "@/components/marketing/landing-hero";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Button } from "@/components/ui/button";
import { useGames } from "@/lib/hooks/use-games";
import { usePools } from "@/lib/hooks/use-pools";
import { PoolType } from "@/lib/enums";
import { DASHBOARD_PATH } from "@/lib/routes";
import type { Pool } from "@/lib/types";

export default function LandingPage() {
  const { data: poolsData } = usePools({ limit: 12 });
  const { data: gamesData } = useGames();

  const publicPools = useMemo(() => {
    const pools = (poolsData?.pools ?? []) as Pool[];
    return pools.filter((pool) => pool.type === PoolType.PUBLIC);
  }, [poolsData]);

  const featuredPool = useMemo(() => {
    if (publicPools.length === 0) return null;

    return publicPools.reduce((best, pool) => {
      const bestPot = best.prize_pot ?? best.prizePot ?? 0;
      const poolPot = pool.prize_pot ?? pool.prizePot ?? 0;
      return poolPot >= bestPot ? pool : best;
    }, publicPools[0]);
  }, [publicPools]);

  const upcomingGamesCount = useMemo(() => {
    const games = (gamesData?.games ?? []) as Array<{ status?: string }>;
    return games.filter(
      (game) => game.status === "scheduled" || game.status === "upcoming"
    ).length;
  }, [gamesData]);

  return (
    <div className="dark">
      <div className="relative min-h-screen bg-background text-foreground">
        <BackgroundLayer />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>

        <MarketingHeader />

        <main id="main-content" className="relative z-10">
          <LandingHero
            featuredPool={featuredPool}
            publicPoolsCount={publicPools.length}
            upcomingGamesCount={upcomingGamesCount}
          />

          <div className="relative isolate overflow-hidden">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.12),_transparent_35%),radial-gradient(circle_at_bottom,_rgba(220,38,38,0.16),_transparent_42%)]" />

            <section className="py-16">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="glass-panel rounded-3xl p-8">
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">
                    Why It Converts
                  </p>
                  <h2 className="mt-4 text-3xl font-black italic sm:text-4xl">
                    Built for first-timers, leagues, and repeat players.
                  </h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                    The public homepage should prove the product is active fast:
                    live winners, open pools, weekly games, and a clean route to
                    sign up when visitors are ready.
                  </p>
                  <div className="mt-8 grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
                      <div className="text-3xl font-black text-white">
                        {publicPools.length}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        public pools available to browse without friction
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
                      <div className="text-3xl font-black text-white">
                        {upcomingGamesCount}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        upcoming NFL games keeping the page feeling current
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
                      <div className="text-3xl font-black text-white">24/7</div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        access to dashboards, invites, payouts, and pool detail
                      </p>
                    </div>
                  </div>
                </div>

                  <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/12 via-black/40 to-black/70 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.2)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 text-2xl font-black italic">
                    Immediate paths for every visitor.
                  </h3>
                  <div className="mt-6 space-y-4 text-sm leading-7 text-muted-foreground">
                    <p>
                      New player: browse public pools, preview the dashboard, and
                      create an account when the product feels real.
                    </p>
                    <p>
                      Existing player: jump back into <code>/login</code> and
                      land in the app quickly.
                    </p>
                    <p>
                      Organizer or brand: move directly into a white-label pitch
                      without wading through app chrome.
                    </p>
                  </div>
                  <Button asChild className="mt-8 min-h-12 px-5 font-semibold uppercase">
                    <Link href="/signup">
                      Start Free
                      <ArrowRight />
                    </Link>
                  </Button>
                  </div>
                </div>
              </div>
            </section>

            <section className="py-8">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <WinnersSection />
              </div>
            </section>

            <HowItWorks />

            <section id="featured-pools" className="scroll-mt-24 py-16">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="overflow-hidden rounded-[2rem] border border-primary/25 bg-gradient-to-r from-primary/12 via-red-950/45 to-red-800/35 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.3)] sm:p-10">
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">
                    Trending Pools
                  </p>
                  <h2 className="mt-4 text-3xl font-black italic sm:text-4xl">
                    2026 Coming Soon
                  </h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                    Fresh pool formats and opening-week contests are on deck for
                    the 2026 NFL season.
                  </p>
                  <div className="mt-8">
                    <Button
                      asChild
                      className="min-h-12 px-6 text-sm font-semibold uppercase"
                    >
                      <Link href="/signup">
                        Pre Register
                        <ArrowRight />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <section className="py-8">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">
                    Weekly Pulse
                  </p>
                  <h2 className="mt-3 text-3xl font-black italic sm:text-4xl">
                    Follow the next slate in real time.
                  </h2>
                </div>
                <Button asChild variant="outline" className="min-h-11 px-5 font-semibold uppercase">
                  <Link href={DASHBOARD_PATH}>See Full Dashboard</Link>
                </Button>
              </div>
                <LiveActionTicker />
              </div>
            </section>

            <section className="py-16">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-r from-primary/15 via-red-950/50 to-red-900/45 p-8 shadow-[0_20px_100px_rgba(0,0,0,0.35)] sm:p-12">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">
                  Ready For Kickoff
                </p>
                <h2 className="mt-4 max-w-3xl text-4xl font-black italic sm:text-5xl">
                  Turn your next NFL pool into something people actually want to
                  come back to.
                </h2>
                <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
                  Use the public landing page to acquire players. Use the app at
                  `/dashboard` to keep them engaged once they are in.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button asChild className="min-h-12 px-6 font-semibold uppercase">
                    <Link href="/signup">
                      Create Account
                      <ArrowRight />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    className="min-h-12 px-6 font-semibold uppercase"
                  >
                    <Link href="/login">I Already Have An Account</Link>
                  </Button>
                </div>
                </div>
              </div>
            </section>
          </div>
        </main>

        <LandingFooter />
      </div>
    </div>
  );
}
