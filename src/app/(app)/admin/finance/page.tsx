"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { useAdminList } from "@/lib/hooks/use-admin";
import { AdminPageHeader, AdminTable, FilterTabs, Pager, StatusBadge, Money, DateTime, type Column } from "@/components/admin/ui";

type Row = {
  id: string;
  source: string;
  kind: string;
  amount: number;
  provider: string;
  status: string;
  reference: string | null;
  userId: string | null;
  poolId: string | null;
  failureReason: string | null;
  date: string;
  user: { id: string; email: string; name: string | null } | null;
  pool: { id: string; name: string } | null;
};
type Tab = "all" | "deposits" | "entry_fees" | "withdrawals" | "payouts" | "refunds" | "failed" | "winnings";

export default function AdminFinancePage() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("type") as Tab) || "all");
  const [provider, setProvider] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useAdminList<{ transactions: Row[]; total: number; totalPages: number; truncated: boolean }>("/api/admin/finance/transactions", {
    type: tab,
    provider: provider || undefined,
    from: from || undefined,
    to: to || undefined,
    userId: params.get("userId") ?? undefined,
    poolId: params.get("poolId") ?? undefined,
    page,
    limit: 25,
  });

  const columns: Column<Row>[] = [
    { key: "date", header: "Date", render: (t) => <DateTime value={t.date} /> },
    { key: "id", header: "Transaction", render: (t) => <span className="font-mono text-[11px]">{t.id.slice(0, 8)}…</span>, secondary: true },
    { key: "user", header: "User", render: (t) => (t.userId ? <Link href={`/admin/users/${t.userId}`} className="text-primary hover:underline text-xs">{t.user?.name ?? t.user?.email ?? t.userId.slice(0, 8)}</Link> : "—") },
    { key: "kind", header: "Type", render: (t) => <span className="font-mono text-xs uppercase">{t.kind.replace(/_/g, " ")}</span> },
    { key: "amount", header: "Amount", render: (t) => <Money value={t.amount} /> },
    { key: "provider", header: "Provider", render: (t) => <span className="text-xs">{t.provider}</span>, secondary: true },
    { key: "pool", header: "Pool", render: (t) => (t.poolId ? <Link href={`/admin/pools/${t.poolId}`} className="hover:text-primary text-xs">{t.pool?.name ?? t.poolId.slice(0, 8)}</Link> : "—"), secondary: true },
    { key: "status", header: "Status", render: (t) => <span className="flex flex-col gap-1"><StatusBadge status={t.status} />{t.failureReason && <span className="text-[11px] text-red-300">{t.failureReason}</span>}</span> },
    { key: "ref", header: "Reference", render: (t) => <span className="font-mono text-[11px] break-all">{t.reference ?? "—"}</span>, secondary: true },
  ];

  return (
    <div>
      <AdminPageHeader title="Finance" description="The ledger across entry fees, balance movements and withdrawals. No copies — this reads the tables the money already lives in." icon={<Wallet className="w-8 h-8" />} actions={<Link href="/admin/finance/withdrawals" className="px-3 py-2 text-sm rounded-lg bg-primary text-white font-bold">Withdrawal queue</Link>} />
      <div className="flex flex-col gap-3 mb-4">
        <FilterTabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} options={[{ value: "all", label: "Transactions" }, { value: "deposits", label: "Deposits" }, { value: "entry_fees", label: "Entry fees" }, { value: "withdrawals", label: "Withdrawals" }, { value: "payouts", label: "Payouts" }, { value: "winnings", label: "Winnings" }, { value: "refunds", label: "Refunds" }, { value: "failed", label: "Failed" }]} />
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <select value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }} className="bg-black/20 border border-white/10 rounded-lg px-3 py-2" aria-label="Provider">
            <option value="">Any provider</option>
            <option value="stripe">Stripe</option>
            <option value="paypal">PayPal</option>
            <option value="revolut">Revolut</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="balance">Balance</option>
          </select>
          <label className="flex items-center gap-1">From <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="bg-black/20 border border-white/10 rounded-lg px-2 py-1.5" /></label>
          <label className="flex items-center gap-1">To <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="bg-black/20 border border-white/10 rounded-lg px-2 py-1.5" /></label>
          {(params.get("userId") || params.get("poolId")) && <span className="text-muted-foreground">Filtered to {params.get("userId") ? "one user" : "one pool"} · <Link href="/admin/finance" className="text-primary underline">clear</Link></span>}
        </div>
      </div>
      <AdminTable columns={columns} rows={data?.transactions ?? []} rowHref={(t) => (t.source === "pool_transactions" ? `/admin/finance/transactions/${t.id}` : t.source === "payout_requests" ? `/admin/finance/withdrawals?id=${t.id}` : undefined)} isLoading={isLoading} error={error?.message ?? null} onRetry={() => refetch()} emptyTitle="No transactions" emptyDescription="Nothing matches this filter yet." />
      {data?.truncated && <p className="text-xs text-amber-300 mt-2">Showing the most recent 400 rows per source. Narrow the date range for older history.</p>}
      <Pager page={page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
