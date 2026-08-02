"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarHeader } from "./sidebar-header";
import { NavItem } from "./nav-item";
import { UserProfileCard } from "./user-profile-card";
import { SidebarProps } from "@/lib/interfaces";

export function Sidebar({
  isOpen,
  isCollapsed,
  navItems,
  activePath,
  onToggleCollapse,
  user,
  isAuthenticated,
  isLoadingUser,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "fixed top-0 left-0 z-40 h-screen border-r bg-card/50 backdrop-blur-xl transition-all duration-300",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        isCollapsed ? "w-20" : "w-64",
      )}
    >
      <div className="flex flex-col h-full relative">
        {/* Collapse Toggle Button */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex absolute -right-3 top-24 bg-card border border-white/10 rounded-full p-1 text-muted-foreground hover:text-white hover:bg-primary/20 transition-all z-50 shadow-lg"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>

        <SidebarHeader isCollapsed={isCollapsed} />

        <nav className="flex-1 py-8 px-3 space-y-2 overflow-hidden">
          {navItems.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={activePath === item.href}
              isCollapsed={isCollapsed}
            />
          ))}
        </nav>

        <UserProfileCard
          isCollapsed={isCollapsed}
          user={user}
          isAuthenticated={isAuthenticated}
          isLoadingUser={isLoadingUser}
        />
      </div>
    </aside>
  );
}
