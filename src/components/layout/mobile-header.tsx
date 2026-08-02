"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { SportPoolLogo } from "@/components/ui/sport-pool-logo";
import { MobileHeaderProps } from "@/lib/interfaces";
import { DASHBOARD_PATH } from "@/lib/routes";

export function MobileHeader({
  sidebarOpen,
  onToggleSidebar,
}: MobileHeaderProps) {
  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 h-16 border-b bg-background/80 backdrop-blur-md z-50 flex items-center justify-between px-4">
      <Link href={DASHBOARD_PATH} className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity duration-200">
        <SportPoolLogo className="h-8 w-14" />
        <span className="font-display font-bold text-xl tracking-wider">
          SPORTS POOL
        </span>
      </Link>
      <button onClick={onToggleSidebar} className="p-2">
        {sidebarOpen ? <X /> : <Menu />}
      </button>
    </header>
  );
}
