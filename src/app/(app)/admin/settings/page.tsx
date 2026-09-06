"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { useAdminList, useAdminAction } from "@/lib/hooks/use-admin";
import { AdminPageHeader, ActionButton, ErrorState, LoadingRows, StatusBadge, useConfirm } from "@/components/admin/ui";

type SettingsResponse = {
  platform: Record<string, unknown> | null;
  compliance: Record<string, unknown> | null;
  payments: { stripe: { secretKey: boolean; webhookSecret: boolean; publishableKey: boolean; mode: string }; payouts: Array<{ method: string; label: string; configured: boolean; problem: string | null; manual: boolean }>; paypalMode: string };
  sports: { source: string };
  canManage: boolean;
};

type Form = {
  platform_name: string; contact_email: string; support_email: string; logo_url: string;
  minimum_entry_fee: string; platform_fee_percentage: string; max_pool_duration_days: string; supported_sports: string;
  maintenance_mode: boolean; brand_primary_color: string; brand_accent_color: string; chat_rules_version: string; chat_slow_mode_seconds: string;
  feature_flags: string;
  default_minimum_age: string; geo_enforcement_enabled: boolean; default_jurisdiction_status: string; kyc_payout_threshold: string; current_tos_version: string;
};

export default function AdminSettingsPage() {
  const { data, isLoading, error, refetch } = useAdminList<SettingsResponse>("/api/admin/settings", {});
  const { confirm, dialog } = useConfirm();
  const save = useAdminAction<{ platform?: Record<string, unknown>; compliance?: Record<string, unknown>; reason: string }>("PATCH", () => "/api/admin/settings", { invalidate: ["/api/admin/settings", "/api/admin/overview"], successMessage: "Settings saved" });
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (!data?.platform) return;
    const p = data.platform;
    const c = data.compliance ?? {};
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeding an editable form from freshly loaded server state
    setForm({
      platform_name: String(p.platform_name ?? "SportsPool"),
      contact_email: String(p.contact_email ?? ""),
      support_email: String(p.support_email ?? ""),
      logo_url: String(p.logo_url ?? ""),
      minimum_entry_fee: String(p.minimum_entry_fee ?? 20),
      platform_fee_percentage: String(p.platform_fee_percentage ?? 10),
      max_pool_duration_days: String(p.max_pool_duration_days ?? 7),
      supported_sports: ((p.supported_sports as string[] | null) ?? ["nfl"]).join(", "),
      maintenance_mode: Boolean(p.maintenance_mode),
      brand_primary_color: String(p.brand_primary_color ?? "#0047AB"),
      brand_accent_color: String(p.brand_accent_color ?? "#D7263D"),
      chat_rules_version: String(p.chat_rules_version ?? ""),
      chat_slow_mode_seconds: String(p.chat_slow_mode_seconds ?? 10),
      feature_flags: JSON.stringify(p.feature_flags ?? {}, null, 0),
      default_minimum_age: String(c.default_minimum_age ?? 18),
      geo_enforcement_enabled: Boolean(c.geo_enforcement_enabled ?? true),
      default_jurisdiction_status: String(c.default_jurisdiction_status ?? "allowed"),
      kyc_payout_threshold: String(c.kyc_payout_threshold ?? 600),
      current_tos_version: String(c.current_tos_version ?? ""),
    });
  }, [data]);

  if (error) return <ErrorState message={error.message} onRetry={() => refetch()} />;
  if (isLoading || !data || !form) return <LoadingRows rows={8} />;
  const canManage = data.canManage;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const submit = () =>
    confirm({
      title: "Save platform settings?",
      danger: true,
      description: "Fee and minimum-entry changes apply to NEW pools only (each pool locks its fee at creation). Requires two-factor.",
      confirmLabel: "Save",
      onConfirm: ({ reason }) => {
        let flags: Record<string, boolean> = {};
        try {
          flags = JSON.parse(form.feature_flags || "{}");
        } catch {
          throw new Error("Feature flags must be valid JSON");
        }
        return save.mutateAsync({
          reason,
          platform: {
            platform_name: form.platform_name.trim(),
            contact_email: form.contact_email.trim() || null,
            support_email: form.support_email.trim() || null,
            logo_url: form.logo_url.trim() || null,
            minimum_entry_fee: Number(form.minimum_entry_fee),
            platform_fee_percentage: Number(form.platform_fee_percentage),
            max_pool_duration_days: Number(form.max_pool_duration_days),
            supported_sports: form.supported_sports.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
            maintenance_mode: form.maintenance_mode,
            brand_primary_color: form.brand_primary_color.trim(),
            brand_accent_color: form.brand_accent_color.trim(),
            chat_rules_version: form.chat_rules_version.trim(),
            chat_slow_mode_seconds: Number(form.chat_slow_mode_seconds),
            feature_flags: flags,
          },
          compliance: {
            default_minimum_age: Number(form.default_minimum_age),
            geo_enforcement_enabled: form.geo_enforcement_enabled,
            default_jurisdiction_status: form.default_jurisdiction_status,
            kyc_payout_threshold: Number(form.kyc_payout_threshold),
            current_tos_version: form.current_tos_version.trim(),
          },
        });
      },
    });

  return (
    <div className="space-y-6">
      {dialog}
      <AdminPageHeader title="Platform settings" description={canManage ? "Changes are audited with your reason and need two-factor." : "Read-only for your role. A super admin can change these."} icon={<Settings className="w-8 h-8" />} actions={canManage ? <ActionButton tone="primary" onClick={submit} disabled={save.isPending}>Save changes</ActionButton> : undefined} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="General">
          <Field label="Platform name"><input className={input} disabled={!canManage} value={form.platform_name} onChange={(e) => set("platform_name", e.target.value)} /></Field>
          <Field label="Contact email"><input className={input} disabled={!canManage} value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} /></Field>
          <Field label="Support email" hint="Shown to users refused at signup or under review."><input className={input} disabled={!canManage} value={form.support_email} onChange={(e) => set("support_email", e.target.value)} /></Field>
          <Field label="Logo URL"><input className={input} disabled={!canManage} value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} /></Field>
        </Section>

        <Section title="Pools">
          <Field label="Minimum entry fee (USD)" hint="Floor is $20; the checkout also enforces it."><input type="number" min={20} className={input} disabled={!canManage} value={form.minimum_entry_fee} onChange={(e) => set("minimum_entry_fee", e.target.value)} /></Field>
          <Field label="Platform fee %" hint="Locked into each pool at creation; existing pools keep theirs."><input type="number" min={0} max={100} step="0.5" className={input} disabled={!canManage} value={form.platform_fee_percentage} onChange={(e) => set("platform_fee_percentage", e.target.value)} /></Field>
          <Field label="Maximum pool duration (days)" hint="1–7. The database refuses anything longer than 7."><input type="number" min={1} max={7} className={input} disabled={!canManage} value={form.max_pool_duration_days} onChange={(e) => set("max_pool_duration_days", e.target.value)} /></Field>
        </Section>

        <Section title="Compliance">
          <Field label="Default minimum age" hint="Jurisdiction rules override this per country/region."><input type="number" min={18} max={25} className={input} disabled={!canManage} value={form.default_minimum_age} onChange={(e) => set("default_minimum_age", e.target.value)} /></Field>
          <Field label="Geo enforcement"><select className={input} disabled={!canManage} value={form.geo_enforcement_enabled ? "on" : "off"} onChange={(e) => set("geo_enforcement_enabled", e.target.value === "on")}><option value="on">Enabled</option><option value="off">Disabled</option></select></Field>
          <Field label="Default jurisdiction status"><select className={input} disabled={!canManage} value={form.default_jurisdiction_status} onChange={(e) => set("default_jurisdiction_status", e.target.value)}><option value="allowed">Allowed</option><option value="review">Review</option><option value="blocked">Blocked</option></select></Field>
          <Field label="KYC payout threshold (USD, rolling 12 months)"><input type="number" min={0} className={input} disabled={!canManage} value={form.kyc_payout_threshold} onChange={(e) => set("kyc_payout_threshold", e.target.value)} /></Field>
          <Field label="Terms version" hint="Changing this makes every user re-accept the terms before their next paid action."><input className={input} disabled={!canManage} value={form.current_tos_version} onChange={(e) => set("current_tos_version", e.target.value)} /></Field>
        </Section>

        <Section title="Payments">
          <Line label="Stripe secret key" value={<StatusBadge status={data.payments.stripe.secretKey ? "configured" : "missing"} />} />
          <Line label="Stripe webhook secret" value={<StatusBadge status={data.payments.stripe.webhookSecret ? "configured" : "missing"} />} />
          <Line label="Stripe mode" value={<StatusBadge status={data.payments.stripe.mode} />} />
          {data.payments.payouts.map((p) => (
            <Line key={p.method} label={`${p.label} payouts`} value={<span className="flex items-center gap-2"><StatusBadge status={p.configured ? (p.manual ? "manual" : "configured") : "missing"} />{p.problem && !p.configured && <span className="text-[11px] text-amber-300">{p.problem}</span>}</span>} />
          ))}
          <Line label="PayPal mode" value={data.payments.paypalMode} />
          <p className="text-[11px] text-muted-foreground pt-2">Credentials are environment variables on the host and are never shown or editable here. Additional payout providers are added in code behind the payout provider interface.</p>
        </Section>

        <Section title="Sports">
          <Field label="Supported sports" hint="Comma-separated codes. Only NFL has a data feed today."><input className={input} disabled={!canManage} value={form.supported_sports} onChange={(e) => set("supported_sports", e.target.value)} /></Field>
          <Line label="Score source" value={<span className="text-xs break-all">{data.sports.source}</span>} />
          <Line label="Sync cadence" value="every 30 min (settle job) + manual from Games" />
        </Section>

        <Section title="Branding">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Primary (cobalt)"><div className="flex items-center gap-2"><input type="color" disabled={!canManage} value={form.brand_primary_color} onChange={(e) => set("brand_primary_color", e.target.value)} className="h-9 w-12 bg-transparent" /><input className={input} disabled={!canManage} value={form.brand_primary_color} onChange={(e) => set("brand_primary_color", e.target.value)} /></div></Field>
            <Field label="Accent (red)"><div className="flex items-center gap-2"><input type="color" disabled={!canManage} value={form.brand_accent_color} onChange={(e) => set("brand_accent_color", e.target.value)} className="h-9 w-12 bg-transparent" /><input className={input} disabled={!canManage} value={form.brand_accent_color} onChange={(e) => set("brand_accent_color", e.target.value)} /></div></Field>
          </div>
          <p className="text-[11px] text-muted-foreground">Stored for white-label tenants and email templates; the app&apos;s theme tokens live in globals.css.</p>
        </Section>

        <Section title="Chat">
          <Field label="Chat rules version" hint="Bump to make everyone re-accept the click-to-message agreement."><input className={input} disabled={!canManage} value={form.chat_rules_version} onChange={(e) => set("chat_rules_version", e.target.value)} /></Field>
          <Field label="Slow mode (seconds between messages)"><input type="number" min={0} max={3600} className={input} disabled={!canManage} value={form.chat_slow_mode_seconds} onChange={(e) => set("chat_slow_mode_seconds", e.target.value)} /></Field>
        </Section>

        <Section title="System">
          <Field label="Maintenance mode" hint="Flag only — surfaced to the app via platform_settings; wire a banner or gate as needed."><select className={input} disabled={!canManage} value={form.maintenance_mode ? "on" : "off"} onChange={(e) => set("maintenance_mode", e.target.value === "on")}><option value="off">Off</option><option value="on">On</option></select></Field>
          <Field label="Feature flags (JSON)"><textarea rows={3} className={input} disabled={!canManage} value={form.feature_flags} onChange={(e) => set("feature_flags", e.target.value)} /></Field>
        </Section>
      </div>
    </div>
  );
}

const input = "w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1 text-xs font-mono uppercase text-muted-foreground">
      {label}
      <div className="normal-case font-sans">{children}</div>
      {hint && <span className="block normal-case font-sans text-[11px] text-muted-foreground/80">{hint}</span>}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-xl p-5 space-y-3">
      <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}
function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-1 border-b border-white/5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
