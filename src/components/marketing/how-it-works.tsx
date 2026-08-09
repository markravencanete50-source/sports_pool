"use client";

import { CalendarDays, Flame, Trophy } from "lucide-react";
import { Reveal, StaggerGroup, StaggerItem, HoverLift } from "@/components/motion/reveal";

const steps = [
  {
    title: "Join Or Start A Pool",
    description:
      "Choose a public league for instant action or launch a private pool for your group.",
    icon: Flame,
  },
  {
    title: "Lock In Your Picks",
    description:
      "Follow the weekly slate, make your calls, and stay in sync with upcoming matchups.",
    icon: CalendarDays,
  },
  {
    title: "Track The Board",
    description:
      "Watch standings, winners, and payouts update as the season moves.",
    icon: Trophy,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">
            How It Works
          </p>
          <h2 className="mt-4 text-3xl font-black italic sm:text-4xl lg:text-5xl">
            Simple enough for every Sunday crew.
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            Join, compete, and keep the season organized — no spreadsheets, no
            chasing entries, no heavy setup.
          </p>
        </Reveal>

        <StaggerGroup className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <StaggerItem key={step.title}>
              <HoverLift
                lift={6}
                className="glass-panel h-full rounded-3xl p-6 shadow-[0_20px_80px_rgba(0,0,0,0.2)] transition-shadow duration-300 hover:shadow-[0_24px_90px_rgba(0,0,0,0.35)] md:p-8"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <step.icon className="h-6 w-6" />
                  </div>
                  <span className="font-mono text-sm uppercase tracking-[0.28em] text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-8 text-2xl font-black italic">{step.title}</h3>
                <p className="mt-4 text-base leading-7 text-muted-foreground">
                  {step.description}
                </p>
              </HoverLift>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
