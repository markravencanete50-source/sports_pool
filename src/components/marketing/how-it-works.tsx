"use client";

import { CalendarDays, Flame, Trophy } from "lucide-react";

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
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">
            How It Works
          </p>
          <h2 className="mt-4 text-4xl font-black italic sm:text-5xl">
            Simple enough for every Sunday crew.
          </h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            The landing page should explain the product in seconds. Join,
            compete, and keep the season organized without any heavy setup.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="glass-panel rounded-3xl p-8 shadow-[0_20px_80px_rgba(0,0,0,0.2)]"
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
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
