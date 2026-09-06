"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MessageSquareWarning } from "lucide-react";
import { useAdminList, useAdminAction, useAdminOverview } from "@/lib/hooks/use-admin";
import { AdminPageHeader, AdminTable, ActionButton, FilterTabs, SearchBox, Pager, StatusBadge, DateTime, useConfirm, type Column } from "@/components/admin/ui";

type Comment = { id: string; pool_id: string; user_id: string; text: string; game_id: string | null; moderation_status: string; moderation_reason: string | null; created_at: string; reports: number; pools: { id: string; name: string } | null; author: { id: string; name: string | null } | null; games: { id: string; home_team_id: string; away_team_id: string } | null };
type Report = { id: string; reason: string; status: string; action_taken: string | null; created_at: string; comment_id: string | null; pool_id: string | null; reporter_id: string; reported_user_id: string | null; reporter: { id: string; name: string | null } | null; reported: { id: string; name: string | null } | null; comments: { id: string; text: string; moderation_status: string } | null; pools: { id: string; name: string } | null };
type Tab = "comments" | "reports";

export default function AdminModerationPage() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "comments");
  const [cStatus, setCStatus] = useState<string>(params.get("status") ?? "all");
  const [rStatus, setRStatus] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const overview = useAdminOverview();
  const canManage = overview.data?.viewer.permissions.includes("moderation.manage") ?? false;
  const canSuspend = overview.data?.viewer.permissions.includes("users.suspend") ?? false;
  const { confirm, dialog } = useConfirm();
  const invalidate = ["/api/admin/moderation/comments", "/api/admin/moderation/reports", "/api/admin/overview"];

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const comments = useAdminList<{ comments: Comment[]; total: number; totalPages: number }>("/api/admin/moderation/comments", { status: cStatus, search: debounced, page, limit: 25 }, { enabled: tab === "comments" });
  const reports = useAdminList<{ reports: Report[]; total: number; totalPages: number }>("/api/admin/moderation/reports", { status: rStatus, page, limit: 25 }, { enabled: tab === "reports" });

  const moderate = useAdminAction<{ id: string; action: string; reason: string; days?: number }>("PATCH", (b) => `/api/admin/moderation/comments/${b.id}`, { invalidate, successMessage: "Moderation applied" });
  const resolve = useAdminAction<{ id: string; action: string; reason: string; contentAction?: string }>("PATCH", (b) => `/api/admin/moderation/reports/${b.id}`, { invalidate, successMessage: "Report updated" });

  const commentActions = (c: Comment) =>
    canManage ? (
      <span className="flex flex-wrap gap-1">
        {c.moderation_status !== "hidden" && c.moderation_status !== "deleted" && <ActionButton onClick={() => confirm({ title: "Hide this message?", description: "Invisible to players; reversible.", confirmLabel: "Hide", onConfirm: ({ reason }) => moderate.mutateAsync({ id: c.id, action: "hide", reason }) })}>Hide</ActionButton>}
        {c.moderation_status !== "deleted" && <ActionButton tone="danger" onClick={() => confirm({ title: "Delete this message?", danger: true, description: "Soft-deleted: hidden from players, kept for the record.", confirmLabel: "Delete", onConfirm: ({ reason }) => moderate.mutateAsync({ id: c.id, action: "delete", reason }) })}>Delete</ActionButton>}
        {c.moderation_status !== "visible" && <ActionButton tone="primary" onClick={() => confirm({ title: "Restore this message?", confirmLabel: "Restore", onConfirm: ({ reason }) => moderate.mutateAsync({ id: c.id, action: "restore", reason }) })}>Restore</ActionButton>}
        {c.moderation_status === "visible" && <ActionButton onClick={() => confirm({ title: "Flag for review?", confirmLabel: "Flag", onConfirm: ({ reason }) => moderate.mutateAsync({ id: c.id, action: "flag", reason }) })}>Flag</ActionButton>}
        <ActionButton onClick={() => confirm({ title: "Warn the author?", description: "Sends the user a notification quoting your reason.", confirmLabel: "Send warning", onConfirm: ({ reason }) => moderate.mutateAsync({ id: c.id, action: "warn", reason }) })}>Warn</ActionButton>
        {canSuspend && <ActionButton tone="danger" onClick={() => confirm({ title: "Suspend the author?", danger: true, description: "Hides the message and suspends the account.", confirmLabel: "Suspend", fields: [{ name: "days", label: "Days", type: "number", min: 1, max: 365, placeholder: "7" }], onConfirm: ({ reason, days }) => moderate.mutateAsync({ id: c.id, action: "suspend_author", reason, days: days ? Number(days) : undefined }) })}>Suspend</ActionButton>}
      </span>
    ) : <span className="text-xs text-muted-foreground">view only</span>;

  const commentColumns: Column<Comment>[] = [
    { key: "text", header: "Comment", render: (c) => <span className="block max-w-md break-words">{c.text}{c.moderation_reason && <span className="block text-[11px] text-muted-foreground">mod: {c.moderation_reason}</span>}</span> },
    { key: "user", header: "User", render: (c) => <Link href={`/admin/users/${c.user_id}`} className="text-primary hover:underline text-xs">{c.author?.name ?? c.user_id.slice(0, 8)}</Link> },
    { key: "pool", header: "Pool", render: (c) => <Link href={`/admin/pools/${c.pool_id}`} className="hover:text-primary text-xs">{c.pools?.name ?? c.pool_id.slice(0, 8)}</Link>, secondary: true },
    { key: "game", header: "Game", render: (c) => (c.games ? <span className="text-xs">{c.games.away_team_id} @ {c.games.home_team_id}</span> : "—"), secondary: true },
    { key: "date", header: "Date", render: (c) => <DateTime value={c.created_at} />, secondary: true },
    { key: "status", header: "Moderation", render: (c) => <span className="flex gap-1"><StatusBadge status={c.moderation_status} />{c.reports > 0 && <StatusBadge status={`${c.reports} report${c.reports === 1 ? "" : "s"}`} />}</span> },
    { key: "actions", header: "Actions", render: commentActions },
  ];

  const reportColumns: Column<Report>[] = [
    { key: "content", header: "Reported content", render: (r) => <span className="block max-w-md break-words">{r.comments?.text ?? "(comment removed)"}{r.comments && <StatusBadge status={r.comments.moderation_status} className="ml-2" />}</span> },
    { key: "reporter", header: "Reporter", render: (r) => <Link href={`/admin/users/${r.reporter_id}`} className="text-primary hover:underline text-xs">{r.reporter?.name ?? r.reporter_id.slice(0, 8)}</Link>, secondary: true },
    { key: "reported", header: "Reported user", render: (r) => (r.reported_user_id ? <Link href={`/admin/users/${r.reported_user_id}`} className="text-primary hover:underline text-xs">{r.reported?.name ?? r.reported_user_id.slice(0, 8)}</Link> : "—") },
    { key: "reason", header: "Reason", render: (r) => <span className="text-xs break-words">{r.reason}</span> },
    { key: "status", header: "Status", render: (r) => <span className="flex flex-col gap-1"><StatusBadge status={r.status} />{r.action_taken && <span className="text-[11px] text-muted-foreground">{r.action_taken}</span>}</span> },
    { key: "date", header: "Date", render: (r) => <DateTime value={r.created_at} />, secondary: true },
    {
      key: "actions",
      header: "Actions",
      render: (r) =>
        canManage ? (
          <span className="flex flex-wrap gap-1">
            {r.status === "pending" && r.comment_id && <ActionButton tone="danger" onClick={() => confirm({ title: "Remove the content and resolve?", danger: true, confirmLabel: "Remove & resolve", onConfirm: ({ reason }) => resolve.mutateAsync({ id: r.id, action: "resolve", reason, contentAction: "hide" }) })}>Remove content</ActionButton>}
            {r.status === "pending" && <ActionButton tone="primary" onClick={() => confirm({ title: "Resolve without removing?", confirmLabel: "Resolve", onConfirm: ({ reason }) => resolve.mutateAsync({ id: r.id, action: "resolve", reason }) })}>Resolve</ActionButton>}
            {r.status === "pending" && <ActionButton onClick={() => confirm({ title: "Dismiss this report?", confirmLabel: "Dismiss", onConfirm: ({ reason }) => resolve.mutateAsync({ id: r.id, action: "dismiss", reason }) })}>Dismiss</ActionButton>}
            {r.status !== "pending" && r.comment_id && r.comments?.moderation_status !== "visible" && <ActionButton onClick={() => confirm({ title: "Restore the content?", confirmLabel: "Restore", onConfirm: ({ reason }) => resolve.mutateAsync({ id: r.id, action: "reopen", reason, contentAction: "restore" }) })}>Restore content</ActionButton>}
            {r.status !== "pending" && <ActionButton onClick={() => confirm({ title: "Reopen this report?", confirmLabel: "Reopen", onConfirm: ({ reason }) => resolve.mutateAsync({ id: r.id, action: "reopen", reason }) })}>Reopen</ActionButton>}
          </span>
        ) : <span className="text-xs text-muted-foreground">view only</span>,
    },
  ];

  return (
    <div>
      {dialog}
      <AdminPageHeader title="Moderation" description="Chat messages and player reports. Hiding is reversible; deleting keeps the record but never shows it again." icon={<MessageSquareWarning className="w-8 h-8" />} />
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between mb-4">
        <div className="flex flex-wrap gap-2">
          <FilterTabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} options={[{ value: "comments", label: "Comments" }, { value: "reports", label: "Reports" }]} />
          {tab === "comments" ? (
            <FilterTabs value={cStatus} onChange={(v) => { setCStatus(v); setPage(1); }} options={[{ value: "all", label: "All" }, { value: "visible", label: "Visible" }, { value: "flagged", label: "Flagged" }, { value: "hidden", label: "Hidden" }, { value: "deleted", label: "Deleted" }]} />
          ) : (
            <FilterTabs value={rStatus} onChange={(v) => { setRStatus(v); setPage(1); }} options={[{ value: "pending", label: "Open" }, { value: "resolved", label: "Resolved" }, { value: "dismissed", label: "Dismissed" }, { value: "all", label: "All" }]} />
          )}
        </div>
        {tab === "comments" && <SearchBox value={search} onChange={setSearch} placeholder="Search message text" />}
      </div>
      {tab === "comments" ? (
        <>
          <AdminTable columns={commentColumns} rows={comments.data?.comments ?? []} isLoading={comments.isLoading} error={comments.error?.message ?? null} onRetry={() => comments.refetch()} emptyTitle="No messages" />
          <Pager page={page} totalPages={comments.data?.totalPages ?? 1} total={comments.data?.total ?? 0} onPageChange={setPage} />
        </>
      ) : (
        <>
          <AdminTable columns={reportColumns} rows={reports.data?.reports ?? []} isLoading={reports.isLoading} error={reports.error?.message ?? null} onRetry={() => reports.refetch()} emptyTitle="No reports" emptyDescription="Players report messages from the pool chat." />
          <Pager page={page} totalPages={reports.data?.totalPages ?? 1} total={reports.data?.total ?? 0} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
