"use client";

import { usePathname } from "next/navigation";
import {
  Home,
  LogIn,
  UserPlus,
  Users,
  Lock,
  Briefcase,
  Mail,
  ShieldCheck,
  Trophy,
  RefreshCw,
  DollarSign,
  Wallet,
  UserCircle,
} from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { FlameCursor } from "@/components/ui/flame-cursor";
import { cn } from "@/lib/utils";
import { BackgroundLayer } from "./layout/background-layer";
import { MobileHeader } from "./layout/mobile-header";
import { Sidebar } from "./layout/sidebar";
import { useAuth } from "@/lib/hooks/use-auth";
import { DASHBOARD_PATH } from "@/lib/routes";

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, isAuthenticated, isLoadingUser } = useAuth();

  // The auth user may carry the role either at the top level (public.users
  // shape) or in Supabase's app_metadata claim.
  const roleUser = user as
    | { app_metadata?: { role?: string }; role?: string }
    | null
    | undefined;
  const isAdmin =
    roleUser?.app_metadata?.role === "admin" || roleUser?.role === "admin";

  // Lock body scroll and allow ESC to dismiss while the drawer is open.
  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sidebarOpen]);

  const navItems = useMemo(() => {
    const baseItems = [
      { href: DASHBOARD_PATH, label: "Dashboard", icon: Home },
      { href: "/public-pools", label: "Public Pools", icon: Users },
    ];

    if (isAuthenticated) {
      const items = [
        ...baseItems,
        { href: "/invitations", label: "Invitations", icon: Mail },
        { href: "/private-pools", label: "Private Pools", icon: Lock },
        { href: "/create-pool", label: "Create Pool", icon: UserPlus },
        { href: "/my-games", label: "My Games", icon: Trophy },
        { href: "/my-games/withdrawals", label: "Withdrawals", icon: Wallet },
        { href: "/account/profile", label: "Profile", icon: UserCircle },
        { href: "/white-label", label: "White Label", icon: Briefcase },
      ];
      if (isAdmin) {
        items.push({ href: "/admin/users", label: "Users", icon: ShieldCheck });
        items.push({
          href: "/admin/games",
          label: "Games & Pools",
          icon: RefreshCw,
        });
        items.push({
          href: "/admin/payouts",
          label: "Payouts",
          icon: DollarSign,
        });
      }
      return items;
    } else {
      return [
        ...baseItems,
        { href: "/login", label: "Log In", icon: LogIn },
        { href: "/signup", label: "Sign Up", icon: UserPlus },
        { href: "/white-label", label: "White Label", icon: Briefcase },
      ];
    }
  }, [isAuthenticated, isAdmin]);

  return (
    <div className="min-h-screen bg-background text-foreground relative font-sans selection:bg-primary selection:text-white">
      <FlameCursor />
      <BackgroundLayer />

      <MobileHeader
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Scrim behind the mobile drawer: dims content, tap to dismiss */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-[45] bg-black/60 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
        />
      )}

      <Sidebar
        isOpen={sidebarOpen}
        isCollapsed={isCollapsed}
        navItems={navItems}
        activePath={pathname}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        onNavigate={() => setSidebarOpen(false)}
        user={user}
        isAuthenticated={isAuthenticated}
        isLoadingUser={isLoadingUser}
      />

      <main
        className={cn(
          "min-h-screen pt-[calc(5rem+env(safe-area-inset-top))] lg:pt-0 transition-[padding] duration-300",
          isCollapsed ? "lg:pl-20" : "lg:pl-64"
        )}
      >
        <div className="container mx-auto p-4 pb-[calc(2rem+env(safe-area-inset-bottom))] lg:p-8 max-w-7xl animate-in fade-in slide-in-from-bottom-2 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
