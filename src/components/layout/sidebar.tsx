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
      id="app-sidebar"
      className={cn(
        "fixed top-0 left-0 z-50 h-dvh border-r bg-card/80 lg:bg-card/50 backdrop-blur-xl pt-safe pb-safe transition-[transform,width] duration-300 ease-out",
        isOpen
          ? "translate-x-0 shadow-2xl shadow-black/50 lg:shadow-none"
          : "-translate-x-full lg:translate-x-0",
        isCollapsed ? "w-64 lg:w-20" : "w-64",
      )}
    >
      <div className="flex flex-col h-full relative">
        {/* Collapse Toggle Button */}
        <button
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex absolute -right-3 top-24 bg-card border border-white/10 rounded-full p-1 text-muted-foreground hover:text-white hover:bg-primary/20 transition-all z-50 shadow-lg"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>

        <SidebarHeader isCollapsed={isCollapsed} />

        <nav className="flex-1 py-6 px-3 space-y-1.5 overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar">
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
