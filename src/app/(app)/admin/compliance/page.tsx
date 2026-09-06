"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useAdminList, useAdminAction, useAdminOverview } from "@/lib/hooks/use-admin";
import { AdminPageHeader, AdminTable, ActionButton, FilterTabs, Pager, StatusBadge, DateTime, useConfirm, type Column } from "@/components/admin/ui";

type Item = {
  kind: "signup" | "account";
  id: string;
  email: string | null;
  name: string | null;
  userId: string | null;
  dateOfBirth: string | null;
  age: number | null;
  minimumAge: number | null;
  location: string | null;
  verificationStatus: string;
  blockReason: string | null;
  accountStatus?: string;
  reviewStatus: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  note: string | null;
  attempts: number | null;
  date: string | null;
};

type View = "pending" | "underage" | "blocked" | "approved" | "rejected" | "all";

export default function AdminCompliancePage() {
  const [view, setView] = useState<View>("pending");
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useAdminList<{ items: Item[]; total: number; totalPages: number }>("/api/admin/compliance", { view, page, limit: 25 });
  const overview = useAdminOverview();
  const canReview = overview.data?.viewer.permissions.includes("compliance.review") ?? false;
  const { confirm, dialog } = useConfirm();

  const signupDecision = useAdminAction<{ id: string; action: string; reason: string }>("PATCH", (b) => `/api/admin/compliance/signups/${b.id}`, {
    invalidate: ["/api/admin/compliance", "/api/admin/overview"],
    successMessage: "Decision recorded",
  });
  const accountDecision = useAdminAction<{ id: string; action: string; reason: string; dateOfBirth?: string }>("PATCH", (b) => `/api/admin/users/${b.id}/age-review`, {
    invalidate: ["/api/admin/compliance", "/api/admin/users", "/api/admin/overview"],
    successMessage: "Decision recorded",
  });

  const decide = (item: Item, action: "approve" | "reject" | "review" | "reopen") => {
    const danger = action === "reject";
    confirm({
      title: `${action[0].toUpperCase() + action.slice(1)} ${item.email ?? item.name ?? "this record"}?`,
      danger,
      description:
        item.kind === "signup"
          ? action === "approve"
            ? "Lifts the block for this email address. The person still needs a date of birth that passes when they register."
            : "The address stays refused. They will be told to contact support."
          : action === "approve"
            ? "Clears the review and restores paid play. Optionally record the verified date of birth."
            : action === "reject"
              ? "Keeps paid play blocked and blocks the account."
              : "Places the account under review; paid play is unavailable until decided.",
      confirmLabel: action[0].toUpperCase() + action.slice(1),
      fields: item.kind === "account" && action === "approve" ? [{ name: "dateOfBirth", label: "Verified date of birth", type: "date" }] : undefined,
      onConfirm: ({ reason, dateOfBirth }) =>
        item.kind === "signup"
          ? signupDecision.mutateAsync({ id: item.id, action: action === "review" ? "reopen" : action, reason })
          : accountDecision.mutateAsync({ id: item.userId!, action: action === "reopen" ? "review" : action, reason, dateOfBirth: dateOfBirth || undefined }),
    });
  };

  const columns: Column<Item>[] = [
    {
      key: "who",
      header: "User",
      render: (i) => (
        <span className="block">
          <span className="block font-medium">{i.name ?? (i.kind === "signup" ? "Signup attempt" : "—")}</span>
          <span className="block text-xs text-muted-foreground">{i.email ?? "—"}</span>
          {i.userId && <Link href={`/admin/users/${i.userId}`} className="text-xs text-primary hover:underline">Open account</Link>}
        </span>
      ),
    },
    { key: "dob", header: "Date of birth", render: (i) => <span className="font-mono text-xs">{i.dateOfBirth ?? "—"}</span> },
    { key: "age", header: "Age", render: (i) => (i.age != null ? `${i.age}${i.minimumAge ? ` / min ${i.minimumAge}` : ""}` : "—") },
    { key: "loc", header: "Location", render: (i) => i.location ?? "—", secondary: true },
    { key: "ver", header: "Verification", render: (i) => <StatusBadge status={i.verificationStatus} />, secondary: true },
    { key: "reason", header: "Block reason", render: (i) => <span className="text-xs">{i.blockReason?.replace(/_/g, " ") ?? "—"}</span>, secondary: true },
    { key: "review", header: "Review", render: (i) => <StatusBadge status={i.reviewStatus} /> },
    { key: "reviewed", header: "Reviewed", render: (i) => <DateTime value={i.reviewedAt} />, secondary: true },
    {
      key: "actions",
      header: "Actions",
      render: (i) =>
        canReview ? (
          <span className="flex flex-wrap gap-1">
            {i.reviewStatus !== "approved" && <ActionButton tone="primary" onClick={() => decide(i, "approve")}>Approve</ActionButton>}
            {i.reviewStatus !== "rejected" && <ActionButton tone="danger" onClick={() => decide(i, "reject")}>Reject</ActionButton>}
            {i.reviewStatus !== "pending" && <ActionButton onClick={() => decide(i, i.kind === "signup" ? "reopen" : "review")}>Re-review</ActionButton>}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">view only</span>
        ),
    },
  ];

  return (
    <div>
      {dialog}
      <AdminPageHeader title="Age verification" description="Signups refused for age and accounts under review. Approving lifts the block; rejecting keeps it." icon={<ShieldCheck className="w-8 h-8" />} />
      <div className="mb-4">
        <FilterTabs
          value={view}
          onChange={(v) => {
            setView(v);
            setPage(1);
          }}
          options={[
            { value: "pending", label: "Needs review" },
            { value: "underage", label: "Underage" },
            { value: "blocked", label: "Blocked" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      <AdminTable columns={columns} rows={data?.items ?? []} isLoading={isLoading} error={error?.message ?? null} onRetry={() => refetch()} emptyTitle="Nothing to review" emptyDescription="No refused signups or accounts under review in this view." />
      <Pager page={page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
