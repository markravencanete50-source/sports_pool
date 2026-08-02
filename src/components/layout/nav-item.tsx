"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { NavItemProps } from "@/lib/interfaces";

export function NavItem({ href, label, icon: Icon, isActive, isCollapsed }: NavItemProps) {
  return (
    <Link href={href}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl cursor-pointer transition-all duration-200 group relative overflow-hidden",
          isCollapsed ? "justify-center px-2 py-3" : "px-4 py-3",
          isActive
            ? "bg-primary text-white shadow-[0_0_20px_-5px_rgba(220,20,60,0.6)]"
            : "hover:bg-white/5 text-muted-foreground hover:text-foreground",
        )}
        title={isCollapsed ? label : undefined}
      >
        {isActive && (
          <motion.div
            layoutId="activeNav"
            className="absolute inset-0 bg-gradient-to-r from-primary to-red-600 z-0"
            initial={false}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
            }}
          />
        )}
        <Icon
          className="h-5 w-5 z-10 relative flex-shrink-0"
          strokeWidth={isActive ? 2.5 : 2}
        />
        <span
          className={cn(
            "font-medium z-10 relative tracking-wide uppercase text-sm transition-all duration-300 whitespace-nowrap",
            isCollapsed ? "opacity-0 w-0 hidden" : "opacity-100",
          )}
        >
          {label}
        </span>
      </div>
    </Link>
  );
}
