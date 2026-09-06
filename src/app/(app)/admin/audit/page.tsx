"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { useAdminList } from "@/lib/hooks/use-admin";
import { AdminPageHeader, AdminTable, SearchBox, Pager, DateTime, type Column } from "@/components/admin/ui";

type Row = { id: string; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; before_state: unknown; after_state: unknown; reason: string | null; created_at: string; actor: { id: string; email: string; name: string | null } | null };

function hrefFor(type: string | null, id: string | null): string | undefined {
  if (!id) return undefined;
  switch (type) {
    case "user": return `/admin/users/${id}`;
    case "pool": return `/admin/pools/${id}`;
    case "pool_transaction": return `/admin/finance/transactions/${id}`;
    case "payout_request": return `/admin/finance/withdrawals?id=${id}`;
    case "pool_promotion": return `/admin/promotions`;
    default: return undefined;
  }
}

export default function AdminAuditPage() {
  const [action, setAction] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(action); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [action]);
  const { data, isLoading, error, refetch } = useAdminList<{ entries: Row[]; total: number; totalPages: number }>("/api/admin/audit", { action: debounced, page, limit: 50 });

  const columns: Column<Row>[] = [
    { key: "when", header: "When", render: (r) => <DateTime value={r.created_at} /> },
    { key: "actor", header: "Admin", render: (r) => (r.actor ? <Link href={`/admin/users/${r.actor.id}`} className="text-primary hover:underline text-xs">{r.actor.name ?? r.actor.email}</Link> : <span className="text-xs text-muted-foreground">system</span>) },
    { key: "action", header: "Action", render: (r) => <span className="font-mono text-xs">{r.action}</span> },
    { key: "target", header: "Target", render: (r) => { const h = hrefFor(r.target_type, r.target_id); const label = `${r.target_type ?? "—"} ${r.target_id ? r.target_id.slice(0, 8) : ""}`; return h ? <Link href={h} className="text-xs hover:text-primary">{label}</Link> : <span className="text-xs">{label}</span>; } },
    { key: "reason", header: "Reason", render: (r) => <span className="text-xs break-words">{r.reason ?? "—"}</span> },
    { key: "diff", header: "Before → after", render: (r) => <span className="font-mono text-[11px] text-muted-foreground break-all">{summarise(r.before_state)} → {summarise(r.after_state)}</span>, secondary: true },
  ];

  return (
    <div>
      <AdminPageHeader title="Audit records" description="Consequential administrative actions only — no page views, no clicks. Each row has the admin, the target, before/after and the reason they gave." icon={<ScrollText className="w-8 h-8" />} />
      <div className="mb-4"><SearchBox value={action} onChange={setAction} placeholder="Filter by action prefix, e.g. pool. or withdrawal.approve" /></div>
      <AdminTable columns={columns} rows={data?.entries ?? []} isLoading={isLoading} error={error?.message ?? null} onRetry={() => refetch()} emptyTitle="No audit records" />
      <Pager page={page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}

function summarise(v: unknown): string {
  if (v == null) return "∅";
  const s = JSON.stringify(v);
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
}
