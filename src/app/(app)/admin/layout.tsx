import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";

/**
 * Every /admin/* page renders inside the console shell. The shell loads
 * /api/admin/overview, which is the authorization check for the UI (the
 * server refuses non-admins with 403; the shell redirects them). Each API
 * route re-checks on its own — this layout is presentation, not protection.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
