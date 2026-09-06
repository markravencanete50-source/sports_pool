"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Trophy, PauseCircle, PlayCircle, XCircle, CheckCircle2, RotateCcw, Calculator, RefreshCw } from "lucide-react";
import { useAdminList, useAdminAction, useAdminOverview } from "@/lib/hooks/use-admin";
import { AdminPageHeader, AdminTable, ActionButton, StatusBadge, Money, DateTime, ErrorState, LoadingRows, useConfirm, type Column } from "@/components/admin/ui";

type Detail = {
  pool: Record<string, unknown> & {
    id: string; name: string; type: string; sport: string; status: string; status_reason: string | null; entry_fee: number; week: number; season: number | null;
    starts_at: string | null; ends_at: string | null; share_slug: string | null; requires_password: boolean; platform_fee_percentage: number | null;
    prize_pot: number; paid_participants: number; platform_fee: number; created_at: string; max_participants: number | null;
    owner: { id?: string; name?: string | null; email?: string | null; account_status?: string | null };
    pool_games: Array<{ game_id: string; games: Record<string, unknown> | null }>;
  };
  participants: Array<{ user_id: string; created_at: string; users: { id: string; name: string | null } | null }>;
  cards: Array<{ id: string; user_id: string; card_number: number; status: string; entry_fee_paid: number; created_at: string; user: { email?: string; name?: string | null } | null }>;
  winners: Array<{ id: string; user_id: string; amount: number; correct: number; total: number; approved_at: string | null; users: { name?: string | null } | null }>;
  payoutApprovals: Array<{ id: string; user_id: string; amount: number; status: string; claimed_at: string | null }>;
  transactions: Array<{ id: string; user_id: string; amount: number; platform_fee: number | null; status: string; refund_status: string; stripe_session_id: string | null; created_at: string; user: { email?: string; name?: string | null } | null }>;
  withdrawals: Array<{ id: string; user_id: string; amount: number; status: string; provider: string; created_at: string }>;
  promotions: Array<{ id: string; status: string; placement: string; amount: number; starts_at: string | null; ends_at: string | null }>;
  audit: Array<{ id: string; action: string; reason: string | null; created_at: string; after_state: Record<string, unknown> | null }>;
};

export default function AdminPoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useAdminList<Detail>(`/api/admin/pools/${id}`, {});
  const overview = useAdminOverview();
  const can = (p: string) => overview.data?.viewer.permissions.includes(p as never) ?? false;
  const { confirm, dialog } = useConfirm();
  const invalidate = [`/api/admin/pools/${id}`, "/api/admin/pools", "/api/admin/overview", "/api/admin/winners"];

  const status = useAdminAction<{ action: string; reason: string }>("PATCH", () => `/api/admin/pools/${id}/status`, { invalidate, successMessage: "Pool updated" });
  const settle = useAdminAction<{ reason: string }, { note?: string }>("POST", () => `/api/admin/pools/${id}/settle`, { invalidate, successMessage: (r) => r.note ?? "Settlement run" });
  const recalculate = useAdminAction<{ reason: string }>("POST", () => `/api/admin/pools/${id}/recalculate`, { invalidate, successMessage: "Winners recalculated" });

  if (error) return <ErrorState message={error.message} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingRows rows={8} />;
  const { pool } = data;
  const st = pool.status;
  const games = pool.pool_games.map((pg) => pg.games).filter(Boolean) as Array<Record<string, unknown>>;

  const act = (action: "pause" | "resume" | "cancel" | "complete" | "reopen") =>
    confirm({
      title: `${action[0].toUpperCase() + action.slice(1)} "${pool.name}"?`,
      danger: action === "cancel" || action === "complete" || action === "reopen",
      description:
        action === "pause" ? "No purchases and no settlement while paused. Players keep their cards."
        : action === "resume" ? "Purchases and settlement resume."
        : action === "cancel" ? "Every paid entry is marked for refund (Finance → Refunds) and cards are cancelled. Refused if the pool already has winners."
        : action === "complete" ? "Forces the pool to completed and runs the normal winner calculation now. Requires two-factor."
        : "Reopens a completed/cancelled pool that has no winners or refunds recorded. Requires two-factor.",
      confirmLabel: action[0].toUpperCase() + action.slice(1),
      onConfirm: ({ reason }) => status.mutateAsync({ action, reason }),
    });

  const cardColumns: Column<Detail["cards"][number]>[] = [
    { key: "user", header: "Player", render: (c) => <span className="text-xs"><Link href={`/admin/users/${c.user_id}`} className="text-primary hover:underline">{c.user?.name ?? c.user?.email ?? c.user_id.slice(0, 8)}</Link></span> },
    { key: "n", header: "Card", render: (c) => `#${c.card_number}` },
    { key: "paid", header: "Paid", render: (c) => <Money value={c.entry_fee_paid} /> },
    { key: "status", header: "Status", render: (c) => <StatusBadge status={c.status} /> },
    { key: "date", header: "Bought", render: (c) => <DateTime value={c.created_at} />, secondary: true },
  ];
  const txColumns: Column<Detail["transactions"][number]>[] = [
    { key: "date", header: "Date", render: (t) => <DateTime value={t.created_at} /> },
    { key: "user", header: "Player", render: (t) => <span className="text-xs">{t.user?.name ?? t.user?.email ?? t.user_id.slice(0, 8)}</span> },
    { key: "amount", header: "Amount", render: (t) => <Money value={t.amount} /> },
    { key: "fee", header: "Fee", render: (t) => <Money value={t.platform_fee ?? 0} />, secondary: true },
    { key: "status", header: "Status", render: (t) => <span className="flex gap-1"><StatusBadge status={t.status} />{t.refund_status !== "none" && <StatusBadge status={t.refund_status} />}</span> },
    { key: "ref", header: "Stripe session", render: (t) => <span className="font-mono text-[11px] break-all">{t.stripe_session_id ?? "—"}</span>, secondary: true },
  ];

  return (
    <div className="space-y-6">
      {dialog}
      <AdminPageHeader
        title={pool.name}
        description={`${pool.type} · ${pool.sport.toUpperCase()} week ${pool.week} · ${games.length} games · owner ${pool.owner?.name ?? pool.owner?.email ?? "—"}`}
        icon={<Trophy className="w-8 h-8" />}
        actions={
          <>
            {can("pools.pause") && (st === "open" || st === "active") && <ActionButton onClick={() => act("pause")}><PauseCircle className="w-3.5 h-3.5 inline mr-1" />Pause</ActionButton>}
            {can("pools.pause") && st === "paused" && <ActionButton tone="primary" onClick={() => act("resume")}><PlayCircle className="w-3.5 h-3.5 inline mr-1" />Resume</ActionButton>}
            {can("pools.complete") && ["open", "active"].includes(st) && (
              <ActionButton onClick={() => confirm({ title: "Run settlement for this pool now?", description: "Refreshes scores from ESPN and, if every game is final, completes the pool and pays winners — exactly as the scheduled job would.", confirmLabel: "Run settlement", requireReason: true, onConfirm: ({ reason }) => settle.mutateAsync({ reason }) })}>
                <RefreshCw className="w-3.5 h-3.5 inline mr-1" />Settle now
              </ActionButton>
            )}
            {can("pools.complete") && ["open", "active", "paused"].includes(st) && <ActionButton onClick={() => act("complete")}><CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />Complete</ActionButton>}
            {can("winners.recalculate") && st === "completed" && (
              <ActionButton tone="danger" onClick={() => confirm({ title: "Recalculate winners?", danger: true, description: "Reverses every winnings credit for this pool (refused if any winner already withdrew), then re-scores from current results and credits the new winners. Requires two-factor.", confirmLabel: "Recalculate", onConfirm: ({ reason }) => recalculate.mutateAsync({ reason }) })}>
                <Calculator className="w-3.5 h-3.5 inline mr-1" />Recalculate
              </ActionButton>
            )}
            {can("pools.reopen") && (st === "completed" || st === "cancelled") && <ActionButton onClick={() => act("reopen")}><RotateCcw className="w-3.5 h-3.5 inline mr-1" />Reopen</ActionButton>}
            {can("pools.cancel") && ["open", "active", "paused"].includes(st) && <ActionButton tone="danger" onClick={() => act("cancel")}><XCircle className="w-3.5 h-3.5 inline mr-1" />Cancel</ActionButton>}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass-panel rounded-xl p-5 space-y-1 text-sm">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Pool</h2>
          <Line label="Status" value={<span className="flex items-center gap-2"><StatusBadge status={st} />{pool.status_reason && <span className="text-xs text-muted-foreground">{pool.status_reason}</span>}</span>} />
          <Line label="Entry fee" value={<Money value={pool.entry_fee} />} />
          <Line label="Max players" value={pool.max_participants ?? "unlimited"} />
          <Line label="Window" value={pool.starts_at || pool.ends_at ? <span><DateTime value={pool.starts_at} /> → <DateTime value={pool.ends_at} /></span> : "week slate"} />
          <Line label="Share link" value={pool.share_slug ? <Link href={`/p/${pool.share_slug}`} className="text-primary underline font-mono text-xs">/p/{pool.share_slug}</Link> : "—"} />
          <Line label="Password" value={pool.requires_password ? "set" : "none"} />
          <Line label="Created" value={<DateTime value={pool.created_at} />} />
          <Line label="Player view" value={<Link href={`/pool/${pool.id}`} className="text-primary underline text-xs">open in app</Link>} />
        </div>
        <div className="glass-panel rounded-xl p-5 space-y-1 text-sm">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Money</h2>
          <Line label="Paid players" value={pool.paid_participants} />
          <Line label="Prize pot" value={<Money value={pool.prize_pot} />} />
          <Line label="Platform fee" value={<span><Money value={pool.platform_fee} /> <span className="text-xs text-muted-foreground">({pool.platform_fee_percentage ?? 10}%)</span></span>} />
          <Line label="Net to winners" value={<Money value={pool.prize_pot - pool.platform_fee} />} />
          <Line label="Refunds required" value={data.transactions.filter((t) => t.refund_status === "refund_required").length} />
          <Line label="Withdrawals" value={data.withdrawals.length} />
        </div>
        <div className="glass-panel rounded-xl p-5 space-y-1 text-sm">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Winners &amp; payout</h2>
          {data.winners.length === 0 ? (
            <p className="text-muted-foreground">No winners recorded{st === "completed" ? " — completed with no scoring card, or settlement refused (see audit)." : "."}</p>
          ) : (
            data.winners.map((w) => {
              const approval = data.payoutApprovals.find((a) => a.user_id === w.user_id);
              return (
                <Line
                  key={w.id}
                  label={<Link href={`/admin/users/${w.user_id}`} className="text-primary hover:underline">{w.users?.name ?? w.user_id.slice(0, 8)}</Link>}
                  value={<span className="flex items-center gap-2"><Money value={w.amount} /><span className="text-xs text-muted-foreground">{w.correct}/{w.total}</span><StatusBadge status={approval?.status ?? "unpaid"} /></span>}
                />
              );
            })
          )}
          {data.winners.length > 1 && <p className="text-xs text-amber-300 pt-1">Tie: pot split across {data.winners.length} cards.</p>}
        </div>
      </div>

      <div className="glass-panel rounded-xl p-5">
        <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Games ({games.length})</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => (
            <div key={String(g.id)} className="rounded-lg border border-white/10 p-3 text-sm flex items-center justify-between gap-2">
              <span>
                <span className="font-display font-bold">{String(g.away_team_id)} @ {String(g.home_team_id)}</span>
                <span className="block text-xs text-muted-foreground"><DateTime value={String(g.date)} /></span>
              </span>
              <span className="text-right">
                <span className="block font-mono">{String(g.away_score ?? "–")} : {String(g.home_score ?? "–")}</span>
                <StatusBadge status={String(g.status)} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-3">Cards ({data.cards.length}) · participants {data.participants.length}</h2>
        <AdminTable columns={cardColumns} rows={data.cards} emptyTitle="No cards bought yet" />
      </div>

      <div>
        <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-3">Transactions</h2>
        <AdminTable columns={txColumns} rows={data.transactions} rowHref={(t) => `/admin/finance/transactions/${t.id}`} emptyTitle="No entry fees yet" />
      </div>

      {data.promotions.length > 0 && (
        <div className="glass-panel rounded-xl p-5 text-sm">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Promotions</h2>
          {data.promotions.map((p) => (
            <Line key={p.id} label={<span>{p.placement} · <DateTime value={p.starts_at} /> → <DateTime value={p.ends_at} /></span>} value={<span className="flex items-center gap-2"><Money value={p.amount} /><StatusBadge status={p.status} /><Link href="/admin/promotions" className="text-primary underline text-xs">manage</Link></span>} />
          ))}
        </div>
      )}

      <div className="glass-panel rounded-xl p-5 text-sm">
        <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Admin actions on this pool</h2>
        {data.audit.length === 0 ? <p className="text-muted-foreground">None recorded.</p> : data.audit.map((a) => (
          <Line key={a.id} label={<span className="font-mono text-xs">{a.action}</span>} value={<span className="text-xs"><DateTime value={a.created_at} /> {a.reason && <span className="text-muted-foreground">— {a.reason}</span>}</span>} />
        ))}
      </div>
    </div>
  );
}

function Line({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 border-b border-white/5 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right min-w-0">{value}</span>
    </div>
  );
}
