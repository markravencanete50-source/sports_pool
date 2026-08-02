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
} from "lucide-react";
import { useState, useMemo } from "react";
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

  const isAdmin =
    (user as any)?.app_metadata?.role === "admin" ||
    (user as any)?.role === "admin";

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
  }, [isAuthenticated, isAdmin, user]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden relative font-sans selection:bg-primary selection:text-white">
      <FlameCursor />
      <BackgroundLayer />

      <MobileHeader
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      <Sidebar
        isOpen={sidebarOpen}
        isCollapsed={isCollapsed}
        navItems={navItems}
        activePath={pathname}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        user={user}
        isAuthenticated={isAuthenticated}
        isLoadingUser={isLoadingUser}
      />

      <main
        className={cn(
          "min-h-screen pt-20 lg:pt-0 transition-all duration-300",
          sidebarOpen ? "blur-sm lg:blur-none" : "",
          isCollapsed ? "lg:pl-20" : "lg:pl-64"
        )}
      >
        <div className="container mx-auto p-4 lg:p-8 max-w-7xl animate-in fade-in duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
