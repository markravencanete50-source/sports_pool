"use client";

import { LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/use-auth";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserProfileCardProps } from "@/lib/interfaces";
import { DASHBOARD_PATH } from "@/lib/routes";

export function UserProfileCard({
  isCollapsed,
  user,
  isAuthenticated,
  isLoadingUser,
}: UserProfileCardProps) {
  const { signout, isSigningOut } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signout();
      toast.success("Logged out successfully");
      router.push(DASHBOARD_PATH);
    } catch {
      toast.error("Failed to log out");
    }
  };

  // Get user display info
  const userName = user?.name || user?.email?.split("@")[0] || "Guest";
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "G";

  if (!isAuthenticated) {
    // Don't show profile card when not authenticated
    return null;
  }

  if (isLoadingUser) {
    return (
      <div className="p-4 border-t border-white/5 overflow-hidden">
        <div
          className={cn(
            "glass-panel rounded-xl flex items-center gap-3 transition-all duration-300",
            isCollapsed ? "p-2 justify-center" : "p-4",
          )}
        >
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-800 to-black flex items-center justify-center border border-white/10 flex-shrink-0 animate-pulse">
            <User className="w-5 h-5 text-muted-foreground" />
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="h-4 bg-white/10 rounded w-24 mb-2 animate-pulse" />
              <div className="h-3 bg-white/5 rounded w-16 animate-pulse" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border-t border-white/5 overflow-hidden">
      <div
        className={cn(
          "glass-panel rounded-xl flex items-center gap-3 transition-all duration-300",
          isCollapsed ? "p-2 justify-center" : "p-4",
        )}
      >
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center border border-primary/30 flex-shrink-0">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={userName}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <span className="text-sm font-bold text-primary">
              {userInitials}
            </span>
          )}
        </div>
        <div
          className={cn(
            "flex-1 min-w-0 transition-all duration-300",
            isCollapsed ? "lg:opacity-0 lg:w-0 lg:hidden opacity-100" : "opacity-100",
          )}
        >
          <p className="font-display text-sm font-bold truncate">
            {userName}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {user?.email || "Member"}
          </p>
        </div>
        <button
          onClick={handleLogout}
          disabled={isSigningOut}
          aria-label="Sign out"
          className={cn(
            "h-9 w-9 -mr-1.5 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-95 cursor-pointer flex-shrink-0 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
            isCollapsed ? "lg:hidden flex" : "flex",
          )}
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
