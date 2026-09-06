"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Banknote, Send } from "lucide-react";
import { useAdminList, useAdminAction, useAdminOverview } from "@/lib/hooks/use-admin";
import { AdminPageHeader, AdminTable, ActionButton, FilterTabs, Pager, StatusBadge, Money, DateTime, useConfirm, type Column } from "@/components/admin/ui";

type Row = {
  id: string;
  user_id: string;
  pool_id: string | null;
  amount: number;
  status: string;
  provider: string;
  provider_reference: string | null;
  stripe_transfer_id: string | null;
  failure_reason: string | null;
  review_reason: string | null;
  retry_count: number;
  created_at: string;
  processed_at: string | null;
  pools: { id: string; name: string } | null;
  user: { id: string; email: string; name: string | null; account_status: string; balance: number } | null;
  payoutAccount: { method: string; identifier: string } | null;
};
type Provider = { method: string; label: string; configured: boolean; problem: string | null; manual: boolean };
type Filter = "queue" | "pending" | "approved" | "on_hold" | "processing" | "completed" | "failed" | "rejected" | "cancelled" | "all";

export default function AdminWithdrawalsPage() {
  const params = useSearchParams();
  const focusId = params.get("id");
  const [filter, setFilter] = useState<Filter>((params.get("status") as Filter) || "queue");
  const [page, setPage] = useState(1);
  const overview = useAdminOverview();
  const can = (p: string) => overview.data?.viewer.permissions.includes(p as never) ?? false;
  const { confirm, dialog } = useConfirm();
  const invalidate = ["/api/admin/withdrawals", "/api/admin/finance/transactions", "/api/admin/overview"];

  const { data, isLoading, error, refetch } = useAdminList<{ withdrawals: Row[]; total: number; totalPages: number; providers: Provider[] }>("/api/admin/withdrawals", {
    status: focusId ? undefined : filter,
    id: focusId ?? undefined,
    page,
    limit: 25,
  });

  const decide = useAdminAction<{ id: string; action: string; reason: string; reference?: string }>("PATCH", (b) => `/api/admin/withdrawals/${b.id}`, { invalidate, successMessage: "Withdrawal updated" });
  const send = useAdminAction<{ id: string; comment?: string }, { message?: string; manual?: boolean }>("PATCH", (b) => `/api/admin/payout-requests/${b.id}/complete`, { invalidate, successMessage: (r) => r.message ?? "Sent" });

  const providerFor = (w: Row) => data?.providers.find((p) => p.method === (w.payoutAccount?.method ?? w.provider));

  const columns: Column<Row>[] = [
    { key: "user", header: "User", render: (w) => <span className="block"><Link href={`/admin/users/${w.user_id}`} className="text-primary hover:underline">{w.user?.name ?? w.user?.email ?? w.user_id.slice(0, 8)}</Link><span className="block text-xs text-muted-foreground">balance <Money value={w.user?.balance ?? 0} /></span></span> },
    { key: "amount", header: "Amount", render: (w) => <Money value={w.amount} /> },
    { key: "method", header: "Method", render: (w) => <span className="text-xs">{w.payoutAccount ? `${w.payoutAccount.method}: ${w.payoutAccount.identifier}` : <span className="text-red-300">no payout account</span>}</span>, secondary: true },
    { key: "status", header: "Status", render: (w) => <span className="flex flex-col gap-1"><StatusBadge status={w.status} />{w.failure_reason && <span className="text-[11px] text-red-300">{w.failure_reason}</span>}{w.review_reason && <span className="text-[11px] text-muted-foreground">{w.review_reason}</span>}</span> },
    { key: "requested", header: "Requested", render: (w) => <DateTime value={w.created_at} /> },
    { key: "provider", header: "Provider", render: (w) => <span className="text-xs">{w.provider}{providerFor(w) && !providerFor(w)!.configured ? <span className="text-amber-300"> (not configured)</span> : ""}</span>, secondary: true },
    { key: "ref", header: "Reference", render: (w) => <span className="font-mono text-[11px] break-all">{w.provider_reference ?? w.stripe_transfer_id ?? "—"}</span>, secondary: true },
    {
      key: "actions",
      header: "Actions",
      render: (w) => {
        const p = providerFor(w);
        const manual = p?.manual ?? false;
        return (
          <span className="flex flex-wrap gap-1">
            {can("withdrawals.approve") && ["pending", "on_hold"].includes(w.status) && <ActionButton tone="primary" onClick={() => confirm({ title: `Approve $${w.amount} withdrawal?`, danger: true, description: "Clears it for sending. Requires two-factor. Money moves at the next step.", confirmLabel: "Approve", onConfirm: ({ reason }) => decide.mutateAsync({ id: w.id, action: "approve", reason }) })}>Approve</ActionButton>}
            {can("withdrawals.approve") && ["approved", "pending"].includes(w.status) && !manual && (
              <ActionButton tone="primary" onClick={() => confirm({ title: `Send $${w.amount} via ${p?.label ?? w.provider}?`, danger: true, description: p?.configured ? "Debits the balance and sends through the provider now. Requires two-factor." : `Blocked: ${p?.problem ?? "provider not configured"}`, confirmLabel: "Send now", requireReason: false, onConfirm: () => send.mutateAsync({ id: w.id }) })} disabled={!p?.configured}>
                <Send className="w-3 h-3 inline mr-1" />Send
              </ActionButton>
            )}
            {can("withdrawals.approve") && ["approved", "pending"].includes(w.status) && manual && <ActionButton onClick={() => confirm({ title: `Start manual ${p?.label} transfer?`, description: "Marks it processing and gives you the transfer instruction. Complete it after sending.", confirmLabel: "Start", requireReason: false, onConfirm: () => send.mutateAsync({ id: w.id }) })}>Start transfer</ActionButton>}
            {can("withdrawals.approve") && w.status === "processing" && manual && <ActionButton tone="primary" onClick={() => confirm({ title: "Confirm the transfer was sent", danger: true, description: "Debits the balance and records the reference. Requires two-factor.", confirmLabel: "Mark completed", fields: [{ name: "reference", label: "Transfer reference", required: true }], onConfirm: ({ reason, reference }) => decide.mutateAsync({ id: w.id, action: "complete_manual", reason, reference }) })}>Mark completed</ActionButton>}
            {can("withdrawals.hold") && ["pending", "approved"].includes(w.status) && <ActionButton onClick={() => confirm({ title: "Place on hold?", confirmLabel: "Hold", onConfirm: ({ reason }) => decide.mutateAsync({ id: w.id, action: "hold", reason }) })}>Hold</ActionButton>}
            {can("withdrawals.reject") && ["pending", "approved", "on_hold"].includes(w.status) && <ActionButton tone="danger" onClick={() => confirm({ title: "Reject this withdrawal?", danger: true, description: "The balance is untouched; the user keeps the funds in their account.", confirmLabel: "Reject", onConfirm: ({ reason }) => decide.mutateAsync({ id: w.id, action: "reject", reason }) })}>Reject</ActionButton>}
            {can("withdrawals.reject") && ["pending", "approved", "on_hold"].includes(w.status) && <ActionButton onClick={() => confirm({ title: "Cancel this withdrawal?", confirmLabel: "Cancel request", onConfirm: ({ reason }) => decide.mutateAsync({ id: w.id, action: "cancel", reason }) })}>Cancel</ActionButton>}
            {can("withdrawals.retry") && w.status === "failed" && <ActionButton onClick={() => confirm({ title: "Retry this payout?", description: "Returns it to the queue. The failed attempt already credited the balance back.", confirmLabel: "Retry", onConfirm: ({ reason }) => decide.mutateAsync({ id: w.id, action: "retry", reason }) })}>Retry</ActionButton>}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      {dialog}
      <AdminPageHeader title="Withdrawals" description="Review, approve, hold, reject or send. Every decision needs a reason; sending and approving need two-factor." icon={<Banknote className="w-8 h-8" />} />
      {data?.providers && (
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          {data.providers.map((p) => (
            <span key={p.method} className={`px-2 py-1 rounded border ${p.configured ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/40 text-amber-300"}`} title={p.problem ?? "ready"}>
              {p.label}: {p.manual ? "manual" : p.configured ? "ready" : "not configured"}
            </span>
          ))}
        </div>
      )}
      {focusId ? (
        <p className="text-xs text-muted-foreground mb-3">Showing one withdrawal · <Link href="/admin/finance/withdrawals" className="text-primary underline">back to the queue</Link></p>
      ) : (
        <div className="mb-4">
          <FilterTabs value={filter} onChange={(v) => { setFilter(v); setPage(1); }} options={[{ value: "queue", label: "Queue" }, { value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "on_hold", label: "On hold" }, { value: "processing", label: "Processing" }, { value: "completed", label: "Completed" }, { value: "failed", label: "Failed" }, { value: "rejected", label: "Rejected" }, { value: "cancelled", label: "Cancelled" }, { value: "all", label: "All" }]} />
        </div>
      )}
      <AdminTable columns={columns} rows={data?.withdrawals ?? []} isLoading={isLoading} error={error?.message ?? null} onRetry={() => refetch()} emptyTitle="Queue is empty" emptyDescription="No withdrawals in this state." />
      <Pager page={page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
