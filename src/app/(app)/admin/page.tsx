"use client";

import { useAdminOverview } from "@/lib/hooks/use-admin";
import { AdminPageHeader, StatCard, StatusBadge, DateTime, ErrorState, Money, useNow } from "@/components/admin/ui";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import Link from "next/link";

/**
 * The control-centre overview: what is happening, and where to click to act.
 * Every tile links into the section that manages it.
 */
export default function AdminDashboardPage() {
  const { data, isLoading, error, refetch, isFetching } = useAdminOverview();
  const s = (group: string, key: string): number => Number(data?.stats?.[group]?.[key] ?? 0);
  const jobs = (data?.stats?.system?.jobs as Array<Record<string, unknown>> | undefined) ?? [];
  const lastSync = data?.stats?.games?.last_sync as string | null | undefined;
  const now = useNow(60_000);
  const syncStale = Boolean(lastSync && now != null && now - new Date(lastSync).getTime() > 2 * 3600_000);

  if (error) return <ErrorState message={error.message} onRetry={() => refetch()} />;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Dashboard"
        description={`Platform overview · ${data?.config.environment ?? ""}${data?.stats?.generated_at ? ` · generated ${new Date(String(data.stats.generated_at)).toLocaleTimeString()}` : ""}`}
        icon={<LayoutDashboard className="w-8 h-8" />}
        actions={
          <button type="button" onClick={() => refetch()} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/10">
            <RefreshCw className={isFetching ? "w-4 h-4 animate-spin" : "w-4 h-4"} /> Refresh
          </button>
        }
      />

      <Section title="Users">
        <StatCard label="Total users" value={s("users", "total")} href="/admin/users" loading={isLoading} />
        <StatCard label="Active" value={s("users", "active")} href="/admin/users?status=active" loading={isLoading} tone="good" />
        <StatCard label="New (7 days)" value={s("users", "new_7d")} href="/admin/users" loading={isLoading} />
        <StatCard label="Blocked" value={s("users", "blocked")} href="/admin/users?status=blocked" loading={isLoading} tone={s("users", "blocked") > 0 ? "bad" : "default"} />
        <StatCard label="Suspended" value={s("users", "suspended")} href="/admin/users?status=suspended" loading={isLoading} tone={s("users", "suspended") > 0 ? "warn" : "default"} />
        <StatCard label="Age reviews" value={s("users", "age_review")} href="/admin/compliance" loading={isLoading} tone={s("users", "age_review") > 0 ? "warn" : "default"} hint="Signups refused + accounts under review" />
      </Section>

      <Section title="Pools">
        <StatCard label="Total pools" value={s("pools", "total")} href="/admin/pools" loading={isLoading} />
        <StatCard label="Active" value={s("pools", "active")} href="/admin/pools?status=active" loading={isLoading} tone="good" />
        <StatCard label="Upcoming (open)" value={s("pools", "upcoming")} href="/admin/pools?status=open" loading={isLoading} />
        <StatCard label="Paused" value={s("pools", "paused")} href="/admin/pools?status=paused" loading={isLoading} tone={s("pools", "paused") > 0 ? "warn" : "default"} />
        <StatCard label="Completed" value={s("pools", "completed")} href="/admin/pools?status=completed" loading={isLoading} />
        <StatCard label="Cancelled" value={s("pools", "cancelled")} href="/admin/pools?status=cancelled" loading={isLoading} />
      </Section>

      <Section title="Financial">
        <StatCard label="Entry fees taken" value={<Money value={s("finance", "entry_fees")} />} href="/admin/finance?type=entry_fees" loading={isLoading} />
        <StatCard label="Platform fees" value={<Money value={s("finance", "platform_fees")} />} href="/admin/finance" loading={isLoading} tone="good" />
        <StatCard label="Pending withdrawals" value={<Money value={s("finance", "pending_withdrawals")} />} hint={`${s("finance", "pending_withdrawal_count")} request(s)`} href="/admin/finance/withdrawals" loading={isLoading} tone={s("finance", "pending_withdrawal_count") > 0 ? "warn" : "default"} />
        <StatCard label="Completed payouts" value={<Money value={s("finance", "completed_payouts")} />} href="/admin/finance/withdrawals?status=completed" loading={isLoading} />
        <StatCard label="Failed payouts" value={s("finance", "failed_payouts")} href="/admin/finance/withdrawals?status=failed" loading={isLoading} tone={s("finance", "failed_payouts") > 0 ? "bad" : "default"} />
        <StatCard label="Refunds required" value={s("finance", "refunds_required")} href="/admin/finance?type=refunds" loading={isLoading} tone={s("finance", "refunds_required") > 0 ? "warn" : "default"} />
      </Section>

      <Section title="Games">
        <StatCard label="Live" value={s("games", "live")} href="/admin/games?status=live" loading={isLoading} tone={s("games", "live") > 0 ? "good" : "default"} />
        <StatCard label="Upcoming" value={s("games", "upcoming")} href="/admin/games?status=scheduled" loading={isLoading} />
        <StatCard label="Completed" value={s("games", "completed")} href="/admin/games?status=finished" loading={isLoading} />
        <StatCard label="Last ESPN sync" value={lastSync ? <DateTime value={lastSync} className="text-base" /> : "never"} href="/admin/games?view=sync" loading={isLoading} tone={syncStale ? "warn" : "default"} hint="Scores refresh every 30 minutes via the settle job" />
      </Section>

      <Section title="Moderation">
        <StatCard label="Flagged comments" value={s("moderation", "flagged_comments")} href="/admin/moderation?status=flagged" loading={isLoading} tone={s("moderation", "flagged_comments") > 0 ? "warn" : "default"} />
        <StatCard label="Open reports" value={s("moderation", "open_reports")} href="/admin/moderation?tab=reports" loading={isLoading} tone={s("moderation", "open_reports") > 0 ? "warn" : "default"} />
        <StatCard label="Hidden comments" value={s("moderation", "hidden_comments")} href="/admin/moderation?status=hidden" loading={isLoading} />
        <StatCard label="Suspended users" value={s("moderation", "suspended_users")} href="/admin/users?status=suspended" loading={isLoading} />
        <StatCard label="Promotion requests" value={s("promotions", "pending")} href="/admin/promotions?status=pending" loading={isLoading} tone={s("promotions", "pending") > 0 ? "warn" : "default"} />
        <StatCard label="Active promotions" value={s("promotions", "active")} href="/admin/promotions?status=active" loading={isLoading} />
      </Section>

      <Section title="System health">
        <StatCard label="Failed scheduled jobs" value={s("system", "failed_jobs")} href="/admin/games?view=sync" loading={isLoading} tone={s("system", "failed_jobs") > 0 ? "bad" : "good"} />
        <StatCard label="Webhook failures (24h)" value={s("system", "webhook_failures_24h")} loading={isLoading} tone={s("system", "webhook_failures_24h") > 0 ? "bad" : "good"} hint="Stripe deliveries that errored" />
        <StatCard label="App errors (24h)" value={s("system", "errors_24h")} loading={isLoading} tone={s("system", "errors_24h") > 0 ? "warn" : "good"} />
        <StatCard
          label="Money path"
          value={data?.config.stripe.secretKey && data?.config.stripe.webhookSecret ? "Stripe ready" : "Stripe incomplete"}
          hint={`${data?.config.stripe.mode ?? "?"} mode · payouts: ${data?.config.payouts.filter((p) => p.configured).map((p) => p.label).join(", ") || "none"}`}
          href="/admin/settings"
          loading={isLoading}
          tone={data?.config.stripe.secretKey && data?.config.stripe.webhookSecret ? "good" : "bad"}
        />
      </Section>

      <div className="glass-panel rounded-xl p-5">
        <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-3">Scheduled jobs</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No job has reported yet. Settle runs every 30 minutes; reconcile daily; alert every 2 hours.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {jobs.map((j) => (
              <div key={String(j.job)} className="rounded-lg border border-white/10 p-3 space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono uppercase">{String(j.job)}</span>
                  <StatusBadge status={String(j.last_status ?? "unknown")} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Last success: <DateTime value={j.last_success_at as string | null} />
                </p>
                {j.last_error ? <p className="text-xs text-red-300 break-words">{String(j.last_error)}</p> : null}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Manual controls live under <Link href="/admin/games?view=sync" className="text-primary underline">Games → Sync Status</Link>.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-3">{title}</h2>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">{children}</div>
    </section>
  );
}
