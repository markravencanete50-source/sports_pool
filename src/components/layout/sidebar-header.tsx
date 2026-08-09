"use client";

import Link from "next/link";
import { SportPoolLogo } from "@/components/ui/sport-pool-logo";
import { cn } from "@/lib/utils";
import { SidebarHeaderProps } from "@/lib/interfaces";
import { DASHBOARD_PATH } from "@/lib/routes";

export function SidebarHeader({ isCollapsed }: SidebarHeaderProps) {
  return (
    <Link
      href={DASHBOARD_PATH}
      className="h-20 px-2 flex items-center justify-center gap-2 border-b border-white/5 overflow-hidden cursor-pointer hover:bg-white/5 transition-colors duration-200"
    >
      <SportPoolLogo
        className={cn(
          "drop-shadow-[0_0_10px_hsl(var(--primary)/0.55)] transition-all duration-300",
          isCollapsed ? "h-8 w-12" : "h-10 w-16"
        )}
      />
      <span
        className={cn(
          "font-display font-bold text-2xl tracking-wider text-primary neon-text transition-opacity duration-300 whitespace-nowrap text-center",
          isCollapsed ? "lg:opacity-0 lg:w-0 lg:hidden opacity-100" : "opacity-100"
        )}
      >
        SPORTS POOL
      </span>
    </Link>
  );
}
