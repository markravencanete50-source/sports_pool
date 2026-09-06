"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { useAdminList, useAdminAction, useAdminOverview } from "@/lib/hooks/use-admin";
import { AdminPageHeader, AdminTable, ActionButton, FilterTabs, Pager, StatusBadge, Money, DateTime, useConfirm, type Column } from "@/components/admin/ui";

type Row = { id: string; pool_id: string; requested_by: string | null; status: string; placement: string; pricing_model: string; amount: number; currency: string; payment_reference: string | null; paid_at: string | null; starts_at: string | null; ends_at: string | null; review_note: string | null; created_at: string; pools: { id: string; name: string; type: string; status: string } | null; owner: { id: string; name: string | null } | null };

export default function AdminPromotionsPage() {
  const params = useSearchParams();
  const [status, setStatus] = useState<string>(params.get("status") ?? "pending");
  const [page, setPage] = useState(1);
  const overview = useAdminOverview();
  const canManage = overview.data?.viewer.permissions.includes("promotions.manage") ?? false;
  const { confirm, dialog } = useConfirm();
  const { data, isLoading, error, refetch } = useAdminList<{ promotions: Row[]; total: number; totalPages: number }>("/api/admin/promotions", { status, page, limit: 25 });
  const act = useAdminAction<{ id: string; action: string; reason: string; days?: number; amount?: number; pricingModel?: string; paymentReference?: string }>("PATCH", (b) => `/api/admin/promotions/${b.id}`, { invalidate: ["/api/admin/promotions", "/api/admin/overview", "/api/pools"], successMessage: "Promotion updated" });

  const columns: Column<Row>[] = [
    { key: "pool", header: "Pool", render: (p) => <span className="block"><Link href={`/admin/pools/${p.pool_id}`} className="hover:text-primary">{p.pools?.name ?? p.pool_id.slice(0, 8)}</Link><span className="block text-xs text-muted-foreground">{p.pools?.type} · {p.pools?.status}</span></span> },
    { key: "owner", header: "Owner", render: (p) => (p.requested_by ? <Link href={`/admin/users/${p.requested_by}`} className="text-primary hover:underline text-xs">{p.owner?.name ?? p.requested_by.slice(0, 8)}</Link> : "—"), secondary: true },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
    { key: "amount", header: "Amount paid", render: (p) => <span><Money value={p.amount} /> <span className="text-xs text-muted-foreground">{p.pricing_model}{p.paid_at ? " · paid" : ""}</span></span> },
    { key: "window", header: "Window", render: (p) => <span className="text-xs"><DateTime value={p.starts_at} /> → <DateTime value={p.ends_at} /></span> },
    { key: "placement", header: "Placement", render: (p) => <span className="text-xs">{p.placement}</span>, secondary: true },
    { key: "note", header: "Note", render: (p) => <span className="text-xs">{p.review_note ?? "—"}</span>, secondary: true },
    {
      key: "actions",
      header: "Actions",
      render: (p) =>
        canManage ? (
          <span className="flex flex-wrap gap-1">
            {p.status === "pending" && <ActionButton tone="primary" onClick={() => confirm({ title: "Approve and activate?", description: "Sets the amount (0 for complimentary while pricing is undecided) and the window. The pool floats to the top of the marketplace for the window.", confirmLabel: "Approve", fields: [{ name: "days", label: "Days", type: "number", min: 1, max: 90, placeholder: "7" }, { name: "amount", label: "Amount charged (USD)", type: "number", min: 0, placeholder: "0" }, { name: "paymentReference", label: "Payment reference (optional)" }], onConfirm: ({ reason, days, amount, paymentReference }) => act.mutateAsync({ id: p.id, action: "approve", reason, days: days ? Number(days) : undefined, amount: amount ? Number(amount) : undefined, pricingModel: amount && Number(amount) > 0 ? "flat" : "complimentary", paymentReference: paymentReference || undefined }) })}>Approve</ActionButton>}
            {p.status === "pending" && <ActionButton tone="danger" onClick={() => confirm({ title: "Reject this request?", confirmLabel: "Reject", onConfirm: ({ reason }) => act.mutateAsync({ id: p.id, action: "reject", reason }) })}>Reject</ActionButton>}
            {p.status === "active" && <ActionButton onClick={() => confirm({ title: "Pause this promotion?", confirmLabel: "Pause", onConfirm: ({ reason }) => act.mutateAsync({ id: p.id, action: "pause", reason }) })}>Pause</ActionButton>}
            {p.status === "paused" && <ActionButton tone="primary" onClick={() => confirm({ title: "Resume this promotion?", confirmLabel: "Resume", onConfirm: ({ reason }) => act.mutateAsync({ id: p.id, action: "resume", reason }) })}>Resume</ActionButton>}
            {["active", "paused"].includes(p.status) && <ActionButton onClick={() => confirm({ title: "Extend the window", confirmLabel: "Extend", fields: [{ name: "days", label: "Extra days", type: "number", min: 1, max: 90, required: true }], onConfirm: ({ reason, days }) => act.mutateAsync({ id: p.id, action: "extend", reason, days: Number(days) }) })}>Extend</ActionButton>}
            {["pending", "approved", "active", "paused"].includes(p.status) && <ActionButton tone="danger" onClick={() => confirm({ title: "Cancel this promotion?", danger: true, confirmLabel: "Cancel promotion", onConfirm: ({ reason }) => act.mutateAsync({ id: p.id, action: "cancel", reason }) })}>Cancel</ActionButton>}
          </span>
        ) : <span className="text-xs text-muted-foreground">view only</span>,
    },
  ];

  return (
    <div>
      {dialog}
      <AdminPageHeader title="Promotions" description="Paid placement for private pools. The pricing model is data on each campaign, so it can change without a schema change." icon={<Megaphone className="w-8 h-8" />} />
      <div className="mb-4">
        <FilterTabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "pending", label: "Requests" }, { value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "expired", label: "Expired" }, { value: "rejected", label: "Rejected" }, { value: "cancelled", label: "Cancelled" }, { value: "all", label: "All" }]} />
      </div>
      <AdminTable columns={columns} rows={data?.promotions ?? []} isLoading={isLoading} error={error?.message ?? null} onRetry={() => refetch()} emptyTitle="No promotions" emptyDescription="Pool owners request promotion from their pool page." />
      <Pager page={page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
