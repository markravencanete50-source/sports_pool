"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Trophy,
  CalendarDays,
  Award,
  Wallet,
  MessageSquareWarning,
  Megaphone,
  Settings,
  UserCog,
  ScrollText,
  Menu,
  X,
  Search,
  ChevronDown,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminOverview } from "@/lib/hooks/use-admin";
import { useAdminSearch } from "@/lib/hooks/use-admin";
import type { Permission } from "@/lib/admin/permissions";
import { ADMIN_ROLE_LABELS } from "@/lib/admin/permissions";
import { DASHBOARD_PATH } from "@/lib/routes";
import { BackgroundLayer } from "@/components/layout/background-layer";
import { SportPoolLogo } from "@/components/ui/sport-pool-logo";

/**
 * The admin console frame: persistent sidebar on desktop, drawer on mobile,
 * global search, and the viewer's role. Navigation is filtered by the
 * permissions the server reports for this session — a courtesy, not a
 * control; every endpoint enforces the same table.
 */
type NavLeaf = { href: string; label: string; permission?: Permission; badgeKey?: string };
type NavGroup = { label: string; icon: ReactNode; href?: string; permission?: Permission; children?: NavLeaf[]; badgeKey?: string };

const NAV: NavGroup[] = [
  { label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, href: "/admin", permission: "dashboard.view" },
  {
    label: "Users",
    icon: <Users className="w-4 h-4" />,
    permission: "users.view",
    children: [
      { href: "/admin/users", label: "All Users" },
      { href: "/admin/users?status=blocked", label: "Blocked Users" },
      { href: "/admin/compliance", label: "Age Reviews", permission: "compliance.view", badgeKey: "users.age_review" },
    ],
  },
  {
    label: "Pools",
    icon: <Trophy className="w-4 h-4" />,
    permission: "pools.view",
    children: [
      { href: "/admin/pools", label: "All Pools" },
      { href: "/admin/pools?status=active", label: "Active" },
      { href: "/admin/pools?status=completed", label: "Completed" },
      { href: "/admin/pools?status=cancelled", label: "Cancelled" },
    ],
  },
  {
    label: "Games",
    icon: <CalendarDays className="w-4 h-4" />,
    permission: "games.view",
    children: [
      { href: "/admin/games", label: "All Games" },
      { href: "/admin/games?status=live", label: "Live", badgeKey: "games.live" },
      { href: "/admin/games?view=sync", label: "Sync Status" },
    ],
  },
  { label: "Winners", icon: <Award className="w-4 h-4" />, href: "/admin/winners", permission: "winners.view" },
  {
    label: "Finance",
    icon: <Wallet className="w-4 h-4" />,
    permission: "transactions.view",
    children: [
      { href: "/admin/finance", label: "Transactions" },
      { href: "/admin/finance/withdrawals", label: "Withdrawals", permission: "withdrawals.view", badgeKey: "finance.pending_withdrawal_count" },
      { href: "/admin/finance?type=payouts", label: "Payouts" },
      { href: "/admin/finance?type=refunds", label: "Refunds", badgeKey: "finance.refunds_required" },
    ],
  },
  {
    label: "Moderation",
    icon: <MessageSquareWarning className="w-4 h-4" />,
    permission: "moderation.view",
    children: [
      { href: "/admin/moderation", label: "Comments" },
      { href: "/admin/moderation?tab=reports", label: "Reports", badgeKey: "moderation.open_reports" },
    ],
  },
  { label: "Promotions", icon: <Megaphone className="w-4 h-4" />, href: "/admin/promotions", permission: "promotions.view", badgeKey: "promotions.pending" },
  { label: "Settings", icon: <Settings className="w-4 h-4" />, href: "/admin/settings", permission: "settings.view" },
  { label: "Admins", icon: <UserCog className="w-4 h-4" />, href: "/admin/admins", permission: "admins.view" },
  { label: "Audit Records", icon: <ScrollText className="w-4 h-4" />, href: "/admin/audit", permission: "audit.view" },
];

function readBadge(stats: Record<string, Record<string, unknown>> | undefined, key?: string): number | null {
  if (!stats || !key) return null;
  const [group, field] = key.split(".");
  const v = stats[group]?.[field];
  return typeof v === "number" && v > 0 ? v : null;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const overview = useAdminOverview();
  const search = useAdminSearch(query);

  const permissions = useMemo(() => new Set(overview.data?.viewer.permissions ?? []), [overview.data]);
  const can = (p?: Permission) => !p || permissions.has(p);

  // Close the drawer on navigation; lock scroll while it is open.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closes the drawer and search panel when the route changes; navigation is the external event
    setOpen(false);
    setSearchOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Not an admin (or signed out): the overview 401/403s. Send them home.
  useEffect(() => {
    const status = (overview.error as (Error & { status?: number }) | null)?.status;
    if (status === 401) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (status === 403) router.replace(DASHBOARD_PATH);
  }, [overview.error, router, pathname]);

  if (overview.isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (overview.error) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="glass-panel rounded-xl p-8 text-center space-y-3 max-w-md">
          <p className="font-bold">Admin console unavailable</p>
          <p className="text-sm text-muted-foreground">{overview.error.message}</p>
          <Link href={DASHBOARD_PATH} className="text-primary underline text-sm">
            Back to the app
          </Link>
        </div>
      </div>
    );
  }

  const isActive = (href: string) => {
    const [path, qs] = href.split("?");
    if (pathname !== path) return false;
    if (!qs) return typeof window === "undefined" ? true : !window.location.search || href === "/admin";
    return typeof window !== "undefined" && window.location.search === `?${qs}`;
  };

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-white/10 flex items-center justify-between">
        <Link href="/admin" className="flex items-center gap-2">
          <SportPoolLogo className="h-7 w-12" />
          <span className="font-display font-bold tracking-wider text-sm leading-tight">
            SPORTSPOOL
            <br />
            <span className="text-primary text-[10px] tracking-[0.3em]">ADMIN</span>
          </span>
        </Link>
        <button type="button" onClick={() => setOpen(false)} className="lg:hidden text-muted-foreground" aria-label="Close menu">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto custom-scrollbar py-3 px-2 space-y-0.5" aria-label="Admin">
        {NAV.filter((g) => can(g.permission)).map((group) => {
          const badge = readBadge(overview.data?.stats, group.badgeKey);
          if (!group.children) {
            return (
              <Link
                key={group.label}
                href={group.href!}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive(group.href!) ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                {group.icon}
                <span className="flex-1">{group.label}</span>
                {badge != null && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/30 text-accent-foreground">{badge}</span>}
              </Link>
            );
          }
          const visibleChildren = group.children.filter((c) => can(c.permission));
          if (visibleChildren.length === 0) return null;
          const groupActive = visibleChildren.some((c) => pathname === c.href.split("?")[0]);
          const isOpen = expanded[group.label] ?? groupActive;
          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [group.label]: !isOpen }))}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  groupActive ? "text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
                aria-expanded={isOpen}
              >
                {group.icon}
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="ml-4 pl-3 border-l border-white/10 space-y-0.5 mb-1">
                  {visibleChildren.map((child) => {
                    const childBadge = readBadge(overview.data?.stats, child.badgeKey);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] transition-colors",
                          isActive(child.href) ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                        )}
                      >
                        <span className="flex-1">{child.label}</span>
                        {childBadge != null && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/30 text-accent-foreground">{childBadge}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4 text-xs space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span className="font-mono uppercase tracking-wider">{ADMIN_ROLE_LABELS[overview.data!.viewer.role]}</span>
        </div>
        <p className="text-muted-foreground">
          {overview.data?.config.environment} · {overview.data?.config.commit ?? "local"}
        </p>
        <div className="flex items-center justify-between gap-2">
          <Link href={DASHBOARD_PATH} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-3 h-3" /> Back to the app
          </Link>
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/signout", { method: "POST", credentials: "include" }).catch(() => undefined);
              window.location.assign("/login");
            }}
            className="text-muted-foreground hover:text-red-300"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      <BackgroundLayer />

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 border-b border-white/10 bg-background/85 backdrop-blur-md pt-safe">
        <div className="h-14 flex items-center justify-between px-3">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-controls="admin-sidebar" className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-white/10">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-display font-bold tracking-wider text-sm">SPORTSPOOL ADMIN</span>
          <button type="button" onClick={() => setSearchOpen((s) => !s)} aria-label="Search" className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-white/10">
            <Search className="w-5 h-5" />
          </button>
        </div>
      </header>

      {open && <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-[45] bg-black/60 backdrop-blur-sm lg:hidden" />}

      <aside
        id="admin-sidebar"
        className={cn(
          "fixed top-0 left-0 z-50 h-dvh w-72 border-r border-white/10 bg-card/95 lg:bg-card/60 backdrop-blur-xl transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {sidebar}
      </aside>

      <div className="lg:pl-72">
        {/* Desktop top bar with search */}
        <div className={cn("sticky top-0 z-30 border-b border-white/10 bg-background/80 backdrop-blur-md", "hidden lg:block")}>
          <div className="h-14 px-6 flex items-center gap-4">
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Search users, emails, pools, transaction or withdrawal ids, games…"
                className="w-full bg-black/20 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                aria-label="Global admin search"
              />
              <SearchResults open={searchOpen && query.trim().length >= 2} results={search.data?.hits ?? []} loading={search.isLoading} onClose={() => setSearchOpen(false)} />
            </div>
          </div>
        </div>

        {/* Mobile search panel */}
        {searchOpen && (
          <div className="lg:hidden fixed top-14 left-0 right-0 z-40 border-b border-white/10 bg-background/95 backdrop-blur-md p-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Global admin search"
            />
            <SearchResults open={query.trim().length >= 2} results={search.data?.hits ?? []} loading={search.isLoading} onClose={() => setSearchOpen(false)} inline />
          </div>
        )}

        <main className="px-4 md:px-6 lg:px-8 pt-20 lg:pt-8 pb-16 max-w-[1400px]">{children}</main>
      </div>
    </div>
  );
}

function SearchResults({
  open,
  results,
  loading,
  onClose,
  inline,
}: {
  open: boolean;
  results: Array<{ type: string; id: string; title: string; subtitle?: string; href: string }>;
  loading: boolean;
  onClose: () => void;
  inline?: boolean;
}) {
  if (!open) return null;
  return (
    <div className={cn("glass-panel rounded-xl border-white/15 overflow-hidden", inline ? "mt-2" : "absolute left-0 right-0 top-full mt-2 z-40")} role="listbox">
      {loading ? (
        <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Searching…
        </div>
      ) : results.length === 0 ? (
        <div className="p-3 text-sm text-muted-foreground">No matches.</div>
      ) : (
        <ul className="max-h-80 overflow-y-auto custom-scrollbar">
          {results.map((r) => (
            <li key={`${r.type}:${r.id}`}>
              <Link href={r.href} onClick={onClose} className="flex items-center gap-3 px-3 py-2 hover:bg-white/5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground w-20 shrink-0">{r.type}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm truncate">{r.title}</span>
                  {r.subtitle && <span className="block text-xs text-muted-foreground truncate">{r.subtitle}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
