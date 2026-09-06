"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { useAdminList, useAdminAction, useAdminOverview } from "@/lib/hooks/use-admin";
import { AdminPageHeader, ActionButton, StatusBadge, Money, DateTime, ErrorState, LoadingRows, useConfirm } from "@/components/admin/ui";

type Detail = {
  transaction: Record<string, unknown> & { id: string; user_id: string; pool_id: string; card_id: string | null; amount: number; platform_fee: number | null; net_amount: number | null; status: string; payment_provider: string | null; stripe_session_id: string | null; payment_id: string | null; refund_status: string; refund_reference: string | null; refunded_at: string | null; refund_reason: string | null; created_at: string; pools: { id: string; name: string; status: string } | null; parlay_cards: { id: string; card_number: number; status: string } | null };
  user: { id: string; email: string; name: string | null; account_status: string } | null;
  related: Array<{ id: string; type: string; amount: number; created_at: string }>;
  audit: Array<{ id: string; action: string; reason: string | null; created_at: string }>;
};

export default function AdminTransactionPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useAdminList<Detail>(`/api/admin/finance/transactions/${id}`, {});
  const overview = useAdminOverview();
  const canRefund = overview.data?.viewer.permissions.includes("transactions.refund") ?? false;
  const { confirm, dialog } = useConfirm();
  const refund = useAdminAction<{ action: string; reason: string; reference?: string }>("PATCH", () => `/api/admin/finance/transactions/${id}`, {
    invalidate: [`/api/admin/finance/transactions/${id}`, "/api/admin/finance/transactions", "/api/admin/overview"],
    successMessage: "Transaction updated",
  });

  if (error) return <ErrorState message={error.message} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingRows rows={6} />;
  const t = data.transaction;

  return (
    <div className="space-y-6">
      {dialog}
      <AdminPageHeader
        title={`Entry fee · ${t.id.slice(0, 8)}`}
        description={`${t.payment_provider ?? "stripe"} · ${new Date(t.created_at).toLocaleString()}`}
        icon={<Receipt className="w-8 h-8" />}
        actions={
          canRefund ? (
            <>
              {t.refund_status === "none" && <ActionButton onClick={() => confirm({ title: "Mark this entry as needing a refund?", description: "Adds it to Finance → Refunds. No money moves.", confirmLabel: "Require refund", onConfirm: ({ reason }) => refund.mutateAsync({ action: "require_refund", reason }) })}>Require refund</ActionButton>}
              {t.refund_status !== "refunded" && <ActionButton tone="danger" onClick={() => confirm({ title: "Record a completed refund", danger: true, description: "Issue the refund in the Stripe dashboard first, then paste the refund id (re_…) here. The card is cancelled. Requires two-factor.", confirmLabel: "Mark refunded", fields: [{ name: "reference", label: "Stripe refund id", placeholder: "re_…", required: true }], onConfirm: ({ reason, reference }) => refund.mutateAsync({ action: "mark_refunded", reason, reference }) })}>Mark refunded</ActionButton>}
              {t.refund_status === "refund_required" && <ActionButton onClick={() => confirm({ title: "Clear the refund flag?", confirmLabel: "Clear", onConfirm: ({ reason }) => refund.mutateAsync({ action: "clear_refund", reason }) })}>Clear flag</ActionButton>}
            </>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-panel rounded-xl p-5 text-sm space-y-1">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Transaction</h2>
          <L label="Id" value={<span className="font-mono text-xs break-all">{t.id}</span>} />
          <L label="Amount" value={<Money value={t.amount} />} />
          <L label="Platform fee" value={<Money value={t.platform_fee ?? 0} />} />
          <L label="Net to pot" value={<Money value={t.net_amount ?? 0} />} />
          <L label="Status" value={<span className="flex gap-1"><StatusBadge status={t.status} />{t.refund_status !== "none" && <StatusBadge status={t.refund_status} />}</span>} />
          <L label="Provider" value={t.payment_provider ?? "stripe"} />
          <L label="Stripe session" value={<span className="font-mono text-xs break-all">{t.stripe_session_id ?? "—"}</span>} />
          <L label="Payment intent" value={<span className="font-mono text-xs break-all">{t.payment_id ?? "—"}</span>} />
          <L label="Date" value={<DateTime value={t.created_at} />} />
        </div>
        <div className="glass-panel rounded-xl p-5 text-sm space-y-1">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Context</h2>
          <L label="User" value={data.user ? <Link href={`/admin/users/${data.user.id}`} className="text-primary hover:underline">{data.user.name ?? data.user.email}</Link> : "—"} />
          <L label="Pool" value={t.pools ? <Link href={`/admin/pools/${t.pools.id}`} className="text-primary hover:underline">{t.pools.name}</Link> : "—"} />
          <L label="Card" value={t.parlay_cards ? <span>#{t.parlay_cards.card_number} <StatusBadge status={t.parlay_cards.status} /></span> : "—"} />
          {t.refund_status !== "none" && (
            <>
              <L label="Refund reference" value={<span className="font-mono text-xs">{t.refund_reference ?? "—"}</span>} />
              <L label="Refunded" value={<DateTime value={t.refunded_at} />} />
              <L label="Refund reason" value={<span className="text-xs">{t.refund_reason ?? "—"}</span>} />
            </>
          )}
          <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground pt-3">Related balance movements</h3>
          {data.related.length === 0 ? <p className="text-muted-foreground text-xs">None</p> : data.related.map((r) => <L key={r.id} label={<span className="font-mono text-xs">{r.type}</span>} value={<span className="flex gap-2"><Money value={r.amount} /><DateTime value={r.created_at} /></span>} />)}
          <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground pt-3">Admin actions</h3>
          {data.audit.length === 0 ? <p className="text-muted-foreground text-xs">None</p> : data.audit.map((a) => <L key={a.id} label={<span className="font-mono text-xs">{a.action}</span>} value={<span className="text-xs"><DateTime value={a.created_at} /> {a.reason && `— ${a.reason}`}</span>} />)}
        </div>
      </div>
    </div>
  );
}

function L({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 border-b border-white/5 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right min-w-0">{value}</span>
    </div>
  );
}
