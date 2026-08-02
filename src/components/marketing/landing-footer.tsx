"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NewsletterSignup } from "@/components/marketing/newsletter-signup";
import { SportPoolLogo } from "@/components/ui/sport-pool-logo";
import { Button } from "@/components/ui/button";
import { DASHBOARD_PATH } from "@/lib/routes";

const footerLinks = [
  { href: "/public-pools", label: "Public Pools" },
  { href: "/login", label: "Log In" },
  { href: "/signup", label: "Sign Up" },
  { href: DASHBOARD_PATH, label: "Dashboard" },
];

const legalLinks = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/contact", label: "Contact" },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto max-w-7xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
        <NewsletterSignup />

        <div className="flex flex-col gap-8 rounded-[2rem] border border-white/10 bg-black/20 p-6 backdrop-blur-xl lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl space-y-4">
            <div className="flex items-center gap-2">
              <SportPoolLogo className="h-8 w-14" />
              <span className="font-display text-xl font-bold tracking-wider">
                SPORTS POOL
              </span>
            </div>
            <p className="text-sm leading-7 text-muted-foreground">
              NFL pool management for leagues, friend groups, communities, and
              brands that want more energy every week.
            </p>
            <Button
              asChild
              variant="ghost"
              className="min-h-11 px-0 text-sm font-semibold uppercase text-primary hover:bg-transparent"
            >
              <Link href="/signup">
                Start your pool today
                <ArrowRight />
              </Link>
            </Button>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <nav
              aria-label="Footer primary"
              className="space-y-3"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
                Explore
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-muted-foreground">
                {footerLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-full px-2 py-1 transition-all duration-200 hover:bg-white/5 hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </nav>

            <nav
              aria-label="Footer legal"
              className="space-y-3"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
                Legal
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-muted-foreground">
                {legalLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-full px-2 py-1 transition-all duration-200 hover:bg-white/5 hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
