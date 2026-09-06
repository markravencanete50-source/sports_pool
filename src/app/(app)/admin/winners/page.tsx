"use client";

import { useState } from "react";
import Link from "next/link";
import { Award } from "lucide-react";
import { useAdminList } from "@/lib/hooks/use-admin";
import { AdminPageHeader, AdminTable, Pager, StatusBadge, Money, DateTime, type Column } from "@/components/admin/ui";

type Row = {
  id: string;
  pool_id: string;
  user_id: string;
  winning_card_id: string | null;
  correct: number;
  total: number;
  amount: number;
  total_score_diff: number | null;
  approved_at: string | null;
  created_at: string;
  pool: { id: string; name: string; status: string } | null;
  user: { id: string; name: string | null } | null;
  tie: boolean;
  payout_status: string;
};

export default function AdminWinnersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useAdminList<{ winners: Row[]; total: number; totalPages: number }>("/api/admin/winners", { page, limit: 25 });

  const columns: Column<Row>[] = [
    { key: "pool", header: "Pool", render: (w) => <Link href={`/admin/pools/${w.pool_id}`} className="hover:text-primary">{w.pool?.name ?? w.pool_id.slice(0, 8)}</Link> },
    { key: "user", header: "Winner", render: (w) => <Link href={`/admin/users/${w.user_id}`} className="text-primary hover:underline">{w.user?.name ?? w.user_id.slice(0, 8)}</Link> },
    { key: "card", header: "Card", render: (w) => <span className="font-mono text-[11px]">{w.winning_card_id?.slice(0, 8) ?? "—"}</span>, secondary: true },
    { key: "score", header: "Score", render: (w) => <span className="font-mono">{w.correct}/{w.total}{w.total_score_diff != null ? <span className="text-xs text-muted-foreground"> · tiebreak Δ{w.total_score_diff}</span> : null}</span> },
    { key: "prize", header: "Prize", render: (w) => <Money value={w.amount} /> },
    { key: "tie", header: "Tie", render: (w) => (w.tie ? <StatusBadge status="split" /> : "—"), secondary: true },
    { key: "payout", header: "Payout", render: (w) => <StatusBadge status={w.payout_status} /> },
    { key: "date", header: "Calculated", render: (w) => <DateTime value={w.created_at} />, secondary: true },
  ];

  return (
    <div>
      <AdminPageHeader title="Winners" description="Every winner on record with where the prize is: credited to balance, withdrawal pending, or withdrawn. Recalculate from the pool page." icon={<Award className="w-8 h-8" />} />
      <AdminTable columns={columns} rows={data?.winners ?? []} rowHref={(w) => `/admin/pools/${w.pool_id}`} isLoading={isLoading} error={error?.message ?? null} onRetry={() => refetch()} emptyTitle="No winners yet" emptyDescription="Winners appear once a pool completes and settles." />
      <Pager page={page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
