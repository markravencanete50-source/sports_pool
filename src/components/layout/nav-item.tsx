"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { NavItemProps } from "@/lib/interfaces";

export function NavItem({
  href,
  label,
  icon: Icon,
  isActive,
  isCollapsed,
  onNavigate,
}: NavItemProps & { onNavigate?: () => void }) {
  return (
    <Link href={href} onClick={onNavigate}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl cursor-pointer transition-all duration-200 group relative overflow-hidden active:scale-[0.98]",
          isCollapsed ? "lg:justify-center lg:px-2 px-4 py-3" : "px-4 py-3",
          isActive
            ? "bg-primary text-white shadow-[0_0_20px_-5px_hsl(var(--primary)/0.7)]"
            : "hover:bg-white/5 text-muted-foreground hover:text-foreground",
        )}
        title={isCollapsed ? label : undefined}
      >
        {isActive && (
          <motion.div
            layoutId="activeNav"
            className="absolute inset-0 bg-gradient-to-r from-primary to-sky-500 z-0"
            initial={false}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
            }}
          />
        )}
        <Icon
          className="h-5 w-5 z-10 relative flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
          strokeWidth={isActive ? 2.5 : 2}
        />
        <span
          className={cn(
            "font-medium z-10 relative tracking-wide uppercase text-sm transition-all duration-300 whitespace-nowrap",
            isCollapsed ? "lg:opacity-0 lg:w-0 lg:hidden opacity-100" : "opacity-100",
          )}
        >
          {label}
        </span>
      </div>
    </Link>
  );
}
