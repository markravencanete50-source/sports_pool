"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SportPoolLogo } from "@/components/ui/sport-pool-logo";
import { DASHBOARD_PATH } from "@/lib/routes";

const navItems = [
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#featured-pools", label: "Pools" },
  { href: "/contact", label: "Contact" },
];

export function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu with ESC.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur-xl pt-safe px-safe">
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
              className="relative text-sm font-medium text-muted-foreground transition-colors hover:text-foreground after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:rounded-full after:bg-primary after:transition-all after:duration-300 hover:after:w-full"
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
          <Button asChild className="min-h-11 px-4 sm:px-5 font-semibold uppercase">
            <Link href="/signup">Create Account</Link>
          </Button>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="marketing-mobile-menu"
            className="relative flex h-11 w-11 items-center justify-center rounded-xl text-foreground transition-all duration-200 hover:bg-white/10 active:scale-95 md:hidden"
          >
            <Menu
              className={`absolute h-6 w-6 transition-all duration-200 ${
                menuOpen ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"
              }`}
            />
            <X
              className={`absolute h-6 w-6 transition-all duration-200 ${
                menuOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"
              }`}
            />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            id="marketing-mobile-menu"
            aria-label="Marketing mobile"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="overflow-hidden border-t border-white/10 md:hidden"
          >
            <div className="space-y-1 px-4 py-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-xl px-4 py-3 text-base font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground active:bg-white/10"
                >
                  {item.label}
                </Link>
              ))}
              <div className="grid grid-cols-2 gap-2 pt-3">
                <Button asChild variant="outline" className="min-h-11">
                  <Link href="/login" onClick={() => setMenuOpen(false)}>
                    Log In
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="min-h-11">
                  <Link href={DASHBOARD_PATH} onClick={() => setMenuOpen(false)}>
                    Dashboard
                  </Link>
                </Button>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
