"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { UserCircle, ShieldAlert, ShieldCheck, Ban, RotateCcw, PauseCircle, StickyNote } from "lucide-react";
import { useAdminList, useAdminAction, useAdminOverview } from "@/lib/hooks/use-admin";
import { AdminPageHeader, AdminTable, ActionButton, StatusBadge, Money, DateTime, ErrorState, LoadingRows, useConfirm, type Column } from "@/components/admin/ui";

type Detail = {
  user: Record<string, unknown> & { id: string; email: string; name: string | null; role: string; admin_role: string | null; account_status: string; status_reason: string | null; suspended_until: string | null; admin_note: string | null; balance: number; created_at: string; last_active_at: string | null };
  compliance: Record<string, unknown> | null;
  payoutAccount: { method: string; identifier: string } | null;
  summary: Record<string, number>;
  pools: { created: Array<Record<string, unknown>>; joined: Array<Record<string, unknown>> };
  winners: Array<Record<string, unknown>>;
  history: Array<{ id: string; kind: string; amount: number; provider: string; status: string; reference: string | null; pool: string | null; poolId: string | null; cardId: string | null; date: string; href: string | null; note?: string | null }>;
};

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useAdminList<Detail>(`/api/admin/users/${id}`, {});
  const overview = useAdminOverview();
  const can = (p: string) => overview.data?.viewer.permissions.includes(p as never) ?? false;
  const { confirm, dialog } = useConfirm();
  const [note, setNote] = useState<string | null>(null);

  const status = useAdminAction<{ action: string; reason: string; days?: number }>("PATCH", () => `/api/admin/users/${id}/status`, {
    invalidate: [`/api/admin/users/${id}`, "/api/admin/users", "/api/admin/overview"],
    successMessage: "Account standing updated",
  });
  const ageReview = useAdminAction<{ action: string; reason: string; dateOfBirth?: string }>("PATCH", () => `/api/admin/users/${id}/age-review`, {
    invalidate: [`/api/admin/users/${id}`, "/api/admin/compliance", "/api/admin/overview"],
    successMessage: "Age review recorded",
  });
  const saveNote = useAdminAction<{ note: string }>("PATCH", () => `/api/admin/users/${id}/note`, {
    invalidate: [`/api/admin/users/${id}`],
    successMessage: "Note saved",
  });

  if (error) return <ErrorState message={error.message} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingRows rows={8} />;

  const { user, compliance, summary, history } = data;
  const isBlocked = user.account_status === "blocked";
  const isSuspended = user.account_status === "suspended";
  const reviewStatus = String(compliance?.age_review_status ?? "none");

  const historyColumns: Column<Detail["history"][number]>[] = [
    { key: "date", header: "Date", render: (t) => <DateTime value={t.date} /> },
    { key: "kind", header: "Type", render: (t) => <span className="font-mono text-xs uppercase">{t.kind.replace(/_/g, " ")}</span> },
    { key: "amount", header: "Amount", render: (t) => <Money value={t.amount} /> },
    { key: "provider", header: "Provider", render: (t) => <span className="text-xs">{t.provider}</span>, secondary: true },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
    { key: "pool", header: "Pool", render: (t) => (t.poolId ? <Link href={`/admin/pools/${t.poolId}`} className="text-primary hover:underline">{t.pool ?? t.poolId.slice(0, 8)}</Link> : "—"), secondary: true },
    { key: "ref", header: "Reference", render: (t) => <span className="font-mono text-[11px] break-all">{t.reference ?? "—"}</span>, secondary: true },
  ];

  return (
    <div className="space-y-6">
      {dialog}
      <AdminPageHeader
        title={user.name ?? user.email}
        description={user.email}
        icon={<UserCircle className="w-8 h-8" />}
        actions={
          <>
            {can("users.block") && !isBlocked && (
              <ActionButton tone="danger" onClick={() => confirm({ title: "Block this account?", danger: true, description: "The user is signed out immediately and cannot sign in, play, or withdraw until unblocked.", confirmLabel: "Block", onConfirm: ({ reason }) => status.mutateAsync({ action: "block", reason }) })}>
                <Ban className="w-3.5 h-3.5 inline mr-1" /> Block
              </ActionButton>
            )}
            {can("users.suspend") && !isBlocked && !isSuspended && (
              <ActionButton onClick={() => confirm({ title: "Suspend this account?", danger: true, description: "A temporary block. Leave days blank for indefinite.", confirmLabel: "Suspend", fields: [{ name: "days", label: "Days", type: "number", min: 1, max: 365, placeholder: "e.g. 7" }], onConfirm: ({ reason, days }) => status.mutateAsync({ action: "suspend", reason, days: days ? Number(days) : undefined }) })}>
                <PauseCircle className="w-3.5 h-3.5 inline mr-1" /> Suspend
              </ActionButton>
            )}
            {can("users.unblock") && (isBlocked || isSuspended) && (
              <ActionButton tone="primary" onClick={() => confirm({ title: isBlocked ? "Unblock this account?" : "Restore this account?", description: "The user can sign in and play again immediately.", confirmLabel: isBlocked ? "Unblock" : "Restore", onConfirm: ({ reason }) => status.mutateAsync({ action: isBlocked ? "unblock" : "restore", reason }) })}>
                <RotateCcw className="w-3.5 h-3.5 inline mr-1" /> {isBlocked ? "Unblock" : "Restore"}
              </ActionButton>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Account">
          <Row label="User id" value={<span className="font-mono text-xs break-all">{user.id}</span>} />
          <Row label="Registered" value={<DateTime value={user.created_at} />} />
          <Row label="Last active" value={<DateTime value={user.last_active_at} />} />
          <Row label="Standing" value={<StatusBadge status={user.account_status} />} />
          {user.status_reason && <Row label="Reason" value={<span className="text-xs">{user.status_reason}</span>} />}
          {user.suspended_until && <Row label="Suspended until" value={<DateTime value={user.suspended_until} />} />}
          <Row label="Role" value={user.role === "admin" ? <StatusBadge status={user.admin_role ?? "super_admin"} /> : "player"} />
          <Row label="Payout account" value={data.payoutAccount ? `${data.payoutAccount.method}: ${data.payoutAccount.identifier}` : "none"} />
        </Card>

        <Card title="Age & compliance" icon={reviewStatus === "pending" ? <ShieldAlert className="w-4 h-4 text-amber-300" /> : <ShieldCheck className="w-4 h-4 text-emerald-400" />}>
          <Row label="Date of birth" value={String(compliance?.date_of_birth ?? "not on file")} />
          <Row label="Verified" value={compliance?.age_verified_at ? <DateTime value={String(compliance.age_verified_at)} /> : <StatusBadge status="unverified" />} />
          <Row label="Age review" value={<StatusBadge status={reviewStatus} />} />
          {compliance?.age_review_reason ? <Row label="Review reason" value={<span className="text-xs">{String(compliance.age_review_reason)}</span>} /> : null}
          <Row label="Registered from" value={[compliance?.registration_country, compliance?.registration_region].filter(Boolean).join("/") || "unknown"} />
          <Row label="KYC" value={<StatusBadge status={String(compliance?.kyc_status ?? "none")} />} />
          <Row label="Self-excluded" value={compliance?.self_excluded_until ? <DateTime value={String(compliance.self_excluded_until)} /> : "no"} />
          {can("compliance.review") && (
            <div className="flex flex-wrap gap-2 pt-2">
              {reviewStatus !== "pending" && (
                <ActionButton onClick={() => confirm({ title: "Put this account under age review?", description: "Paid contests are unavailable to the user until you decide.", confirmLabel: "Start review", onConfirm: ({ reason }) => ageReview.mutateAsync({ action: "review", reason }) })}>Review</ActionButton>
              )}
              <ActionButton tone="primary" onClick={() => confirm({ title: "Approve age verification?", description: "Optionally record the verified date of birth.", confirmLabel: "Approve", fields: [{ name: "dateOfBirth", label: "Verified date of birth", type: "date" }], onConfirm: ({ reason, dateOfBirth }) => ageReview.mutateAsync({ action: "approve", reason, dateOfBirth: dateOfBirth || undefined }) })}>Approve</ActionButton>
              <ActionButton tone="danger" onClick={() => confirm({ title: "Reject age verification?", danger: true, description: "The account is blocked and cannot play.", confirmLabel: "Reject", onConfirm: ({ reason }) => ageReview.mutateAsync({ action: "reject", reason }) })}>Reject</ActionButton>
            </div>
          )}
        </Card>

        <Card title="Financial summary">
          <Row label="Balance" value={<Money value={summary.balance} />} />
          <Row label="Total deposits" value={<Money value={summary.totalDeposits} />} />
          <Row label="Entry fees" value={<Money value={summary.totalEntryFees} />} />
          <Row label="Winnings" value={<Money value={summary.totalWinnings} />} />
          <Row label="Withdrawn" value={<Money value={summary.totalWithdrawals} />} />
          <Row label="Pending withdrawals" value={<Money value={summary.pendingWithdrawals} />} />
          <Row label="Pools" value={`${summary.poolsJoined} joined · ${summary.poolsCreated} created · ${summary.activePools} active · ${summary.completedPools} completed`} />
        </Card>
      </div>

      <Card title="Administrative note" icon={<StickyNote className="w-4 h-4" />}>
        <textarea
          value={note ?? user.admin_note ?? ""}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          disabled={!can("users.note")}
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          placeholder="Only visible to administrators."
        />
        {can("users.note") && (
          <div className="flex justify-end pt-2">
            <ActionButton tone="primary" disabled={note === null || note === (user.admin_note ?? "")} onClick={() => saveNote.mutate({ note: note ?? "" })}>
              Save note
            </ActionButton>
          </div>
        )}
      </Card>

      <div>
        <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-3">Payment history</h2>
        <AdminTable columns={historyColumns} rows={history} rowHref={(t) => t.href ?? undefined} emptyTitle="No payments yet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Pools created (${data.pools.created.length})`}>
          {data.pools.created.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : data.pools.created.map((p) => <PoolLine key={String(p.id)} p={p} />)}
        </Card>
        <Card title={`Pools joined (${data.pools.joined.length})`}>
          {data.pools.joined.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : data.pools.joined.map((p) => <PoolLine key={String(p.id)} p={p} />)}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-xl p-5 space-y-2">
      <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-2">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-1 border-b border-white/5 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right min-w-0">{value}</span>
    </div>
  );
}

function PoolLine({ p }: { p: Record<string, unknown> }) {
  return (
    <Link href={`/admin/pools/${p.id}`} className="flex items-center justify-between gap-2 py-1.5 text-sm hover:text-primary">
      <span className="truncate">{String(p.name)}</span>
      <span className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">${Number(p.entry_fee)}</span>
        <StatusBadge status={String(p.status)} />
      </span>
    </Link>
  );
}
