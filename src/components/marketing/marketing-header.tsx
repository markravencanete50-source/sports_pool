"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SportPoolLogo } from "@/components/ui/sport-pool-logo";
import { DASHBOARD_PATH } from "@/lib/routes";

const navItems = [
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#featured-pools", label: "Pools" },
  { href: "/contact", label: "Contact" },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-85"
        >
          <SportPoolLogo className="h-8 w-14" />
          <span className="font-display text-xl font-bold tracking-wider">
            SPORTS POOL
          </span>
        </Link>

        <nav
          aria-label="Marketing"
          className="hidden items-center gap-8 md:flex"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/login">Log In</Link>
          </Button>
          <Button asChild variant="outline" className="hidden md:inline-flex">
            <Link href={DASHBOARD_PATH}>View Dashboard</Link>
          </Button>
          <Button asChild className="min-h-11 px-5 font-semibold uppercase">
            <Link href="/signup">Create Account</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
