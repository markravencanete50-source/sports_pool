"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Trophy, Users } from "lucide-react";
import { FeaturedPoolCard } from "@/components/home/featured-pool-card";
import { Reveal, StaggerGroup, StaggerItem, HoverLift } from "@/components/motion/reveal";
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
        <Image
          src="/generated_images/abstract_red_neon_stadium_background.png"
          alt=""
          aria-hidden="true"
          fill
          sizes="100vw"
          priority
          className="h-full w-full object-cover opacity-15"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/82 to-background" />
      </div>

      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center lg:px-8 lg:py-24 xl:grid-cols-[minmax(0,1fr)_460px]">
        <StaggerGroup stagger={0.1} className="space-y-8">
          <StaggerItem>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary animate-glow-pulse">
              NFL Pools For 2026 Season
            </div>
          </StaggerItem>

          <StaggerItem className="space-y-5">
            <h1 className="max-w-4xl text-4xl font-black italic leading-[0.98] sm:text-5xl md:text-6xl lg:leading-[0.95] xl:text-7xl">
              Build hype before kickoff and keep every pick alive.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8 lg:text-xl">
              Run public or private NFL pools, invite your league, track live
              action, and turn every slate into a shared event.
            </p>
          </StaggerItem>

          <StaggerItem>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild className="min-h-12 px-6 text-sm font-semibold uppercase group">
                <Link href="/signup">
                  Create Your Account
                  <ArrowRight className="transition-transform duration-200 group-hover:translate-x-1" />
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
          </StaggerItem>

          <StaggerItem>
            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
              {stats.map((stat) => (
                <HoverLift
                  key={stat.label}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-md transition-colors duration-300 hover:border-primary/30 sm:p-5"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div className="text-2xl font-black text-white tabular-nums">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    {stat.label}
                  </div>
                </HoverLift>
              ))}
            </div>
          </StaggerItem>
        </StaggerGroup>

        <Reveal delay={0.25} y={32} className="relative">
          <div className="absolute -inset-4 rounded-[2rem] bg-primary/10 blur-3xl" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.35, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="relative rounded-[2rem] border border-white/10 bg-black/40 p-3 backdrop-blur-xl sm:p-4"
          >
            <FeaturedPoolCard pool={featuredPool} />
          </motion.div>
        </Reveal>
      </div>
    </section>
  );
}
