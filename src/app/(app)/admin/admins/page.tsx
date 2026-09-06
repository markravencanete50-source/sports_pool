"use client";

import Link from "next/link";
import { UserCog } from "lucide-react";
import { useAdminList, useAdminAction, useAdminOverview } from "@/lib/hooks/use-admin";
import { AdminPageHeader, AdminTable, ActionButton, StatusBadge, DateTime, useConfirm, type Column } from "@/components/admin/ui";
import { ADMIN_ROLES, ADMIN_ROLE_LABELS, permissionsFor, type AdminRole } from "@/lib/admin/permissions";

type Row = { id: string; email: string; name: string | null; admin_role: string | null; effective_role: AdminRole; role_label: string; account_status: string; created_at: string; last_active_at: string | null; permissions: string[] };

export default function AdminAdminsPage() {
  const { data, isLoading, error, refetch } = useAdminList<{ admins: Row[] }>("/api/admin/admins", {});
  const overview = useAdminOverview();
  const canManage = overview.data?.viewer.permissions.includes("admins.manage") ?? false;
  const { confirm, dialog } = useConfirm();
  const setRole = useAdminAction<{ id: string; adminRole: string; reason: string }>("PATCH", (b) => `/api/admin/admins/${b.id}`, { invalidate: ["/api/admin/admins", "/api/admin/overview"], successMessage: "Role updated" });

  const columns: Column<Row>[] = [
    { key: "who", header: "Administrator", render: (a) => <span className="block"><Link href={`/admin/users/${a.id}`} className="font-medium hover:text-primary">{a.name ?? a.email}</Link><span className="block text-xs text-muted-foreground">{a.email}</span></span> },
    { key: "role", header: "Role", render: (a) => <StatusBadge status={a.effective_role} /> },
    { key: "perms", header: "Permissions", render: (a) => <span className="text-[11px] text-muted-foreground">{a.permissions.length === permissionsFor("super_admin").length ? "all" : a.permissions.join(", ")}</span>, secondary: true },
    { key: "status", header: "Status", render: (a) => <StatusBadge status={a.account_status} />, secondary: true },
    { key: "active", header: "Last active", render: (a) => <DateTime value={a.last_active_at} />, secondary: true },
    {
      key: "actions",
      header: "Actions",
      render: (a) =>
        canManage ? (
          <span className="flex flex-wrap gap-1">
            {ADMIN_ROLES.filter((r) => r !== a.effective_role).map((r) => (
              <ActionButton key={r} onClick={() => confirm({ title: `Make ${a.name ?? a.email} a ${ADMIN_ROLE_LABELS[r]}?`, danger: true, description: <span>Grants: <span className="text-xs">{permissionsFor(r).join(", ")}</span>. Requires two-factor.</span>, confirmLabel: "Change role", onConfirm: ({ reason }) => setRole.mutateAsync({ id: a.id, adminRole: r, reason }) })}>
                {ADMIN_ROLE_LABELS[r]}
              </ActionButton>
            ))}
            <ActionButton tone="danger" onClick={() => confirm({ title: `Revoke admin access for ${a.name ?? a.email}?`, danger: true, description: "They become an ordinary player immediately. Requires two-factor.", confirmLabel: "Revoke", onConfirm: ({ reason }) => setRole.mutateAsync({ id: a.id, adminRole: "revoke", reason }) })}>Revoke</ActionButton>
          </span>
        ) : <span className="text-xs text-muted-foreground">view only</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {dialog}
      <AdminPageHeader title="Administrators" description="Roles narrow what an admin can do; the server enforces the same table on every request. Promote a player to admin from their user page's role control." icon={<UserCog className="w-8 h-8" />} />
      <AdminTable columns={columns} rows={data?.admins ?? []} isLoading={isLoading} error={error?.message ?? null} onRetry={() => refetch()} emptyTitle="No administrators" />
      <div className="glass-panel rounded-xl p-5 text-sm">
        <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Role reference</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {ADMIN_ROLES.map((r) => (
            <div key={r} className="rounded-lg border border-white/10 p-3">
              <p className="font-bold">{ADMIN_ROLE_LABELS[r]}</p>
              <p className="text-[11px] text-muted-foreground break-words">{permissionsFor(r).join(" · ")}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
