"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SportPoolLogo } from "@/components/ui/sport-pool-logo";
import { MobileHeaderProps } from "@/lib/interfaces";
import { DASHBOARD_PATH } from "@/lib/routes";

export function MobileHeader({
  sidebarOpen,
  onToggleSidebar,
}: MobileHeaderProps) {
  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 border-b bg-background/80 backdrop-blur-md z-40 pt-safe px-safe">
      <div className="h-16 flex items-center justify-between px-4">
        <Link
          href={DASHBOARD_PATH}
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 active:opacity-70 transition-opacity duration-200"
        >
          <SportPoolLogo className="h-8 w-14" />
          <span className="font-display font-bold text-xl tracking-wider">
            SPORTS POOL
          </span>
        </Link>
        <button
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
          className="relative h-11 w-11 -mr-2 flex items-center justify-center rounded-xl text-foreground hover:bg-white/10 active:scale-95 transition-all duration-200"
        >
          <Menu
            className={cn(
              "absolute h-6 w-6 transition-all duration-200",
              sidebarOpen ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"
            )}
          />
          <X
            className={cn(
              "absolute h-6 w-6 transition-all duration-200",
              sidebarOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"
            )}
          />
        </button>
      </div>
    </header>
  );
}
