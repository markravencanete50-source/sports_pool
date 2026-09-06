"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, RefreshCw, ShieldAlert, X } from "lucide-react";
import Link from "next/link";

/* ------------------------------------------------------------------------ */
/* Page chrome                                                               */
/* ------------------------------------------------------------------------ */

export function AdminPageHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 mb-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-3xl md:text-4xl font-black font-display italic uppercase flex items-center gap-3">
          {icon && <span className="text-primary shrink-0">{icon}</span>}
          <span className="truncate">{title}</span>
        </h1>
        {description && <p className="text-muted-foreground mt-1 max-w-3xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 xl:justify-end xl:max-w-[55%]">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "default" | "good" | "warn" | "bad";
  loading?: boolean;
}) {
  const inner = (
    <div
      className={cn(
        "glass-panel rounded-xl p-4 h-full flex flex-col justify-between gap-2 transition-colors",
        href && "hover:border-primary/60 hover:bg-white/5",
        tone === "good" && "border-emerald-500/30",
        tone === "warn" && "border-amber-500/40",
        tone === "bad" && "border-red-500/50"
      )}
    >
      <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      {loading ? (
        <div className="skeleton h-8 w-24" />
      ) : (
        <span
          className={cn(
            "text-2xl md:text-3xl font-bold font-mono tabular-nums",
            tone === "good" && "text-emerald-400",
            tone === "warn" && "text-amber-300",
            tone === "bad" && "text-red-400"
          )}
        >
          {value}
        </span>
      )}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const s = String(status ?? "unknown").toLowerCase();
  const tone =
    ["active", "completed", "ok", "visible", "approved", "resolved", "verified", "live"].includes(s)
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : ["pending", "open", "processing", "on_hold", "running", "pending_claim", "scheduled", "flagged", "review"].includes(s)
        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
        : ["blocked", "suspended", "cancelled", "canceled", "rejected", "failed", "error", "deleted", "hidden", "expired"].includes(s)
          ? "bg-red-500/15 text-red-300 border-red-500/30"
          : ["paused", "dismissed", "none", "unverified", "unpaid"].includes(s)
            ? "bg-white/5 text-muted-foreground border-white/10"
            : "bg-primary/15 text-primary border-primary/30";
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border whitespace-nowrap",
        tone,
        className
      )}
    >
      {s.replace(/_/g, " ")}
    </span>
  );
}

export function Money({ value, className }: { value: number | string | null | undefined; className?: string }) {
  const n = Number(value ?? 0);
  return (
    <span className={cn("font-mono tabular-nums", n < 0 && "text-red-300", className)}>
      {n < 0 ? "-" : ""}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

export function DateTime({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const d = new Date(value);
  return (
    <time dateTime={value} title={d.toISOString()} className={cn("font-mono text-xs whitespace-nowrap", className)}>
      {d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}

/**
 * The current time as state, refreshed on an interval, so "x minutes ago"
 * style derivations stay pure during render (the React Compiler forbids
 * Date.now() in render) and still tick.
 */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clock seeded after mount on purpose: Date.now() is impure and must not run during render
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/* ------------------------------------------------------------------------ */
/* States                                                                    */
/* ------------------------------------------------------------------------ */

export function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-12 rounded-lg" />
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="glass-panel rounded-xl p-10 text-center space-y-2">
      <p className="font-display font-bold uppercase text-lg">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="glass-panel rounded-xl p-8 text-center space-y-3 border-red-500/30">
      <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
      <p className="text-sm text-red-300">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/10">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Table (desktop) that collapses to cards (mobile)                          */
/* ------------------------------------------------------------------------ */

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** Hide on small screens where the card layout shows only the essentials. */
  secondary?: boolean;
}

export function AdminTable<T extends { id: string | number }>({
  columns,
  rows,
  rowHref,
  emptyTitle = "Nothing here",
  emptyDescription,
  isLoading,
  error,
  onRetry,
}: {
  columns: Column<T>[];
  rows: T[];
  rowHref?: (row: T) => string | undefined;
  emptyTitle?: string;
  emptyDescription?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (isLoading) return <LoadingRows />;
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block rounded-xl border border-white/10 overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              {columns.map((c) => (
                <th key={c.key} className={cn("px-4 py-3 text-[11px] font-mono uppercase tracking-wider text-muted-foreground", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr key={row.id} className={cn("border-b border-white/5 last:border-0", href && "hover:bg-white/5")}>
                  {columns.map((c, i) => (
                    <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                      {i === 0 && href ? (
                        <Link href={href} className="hover:text-primary">
                          {c.render(row)}
                        </Link>
                      ) : (
                        c.render(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {rows.map((row) => {
          const href = rowHref?.(row);
          const body = (
            <div className="glass-panel rounded-xl p-4 space-y-2">
              {columns
                .filter((c) => !c.secondary)
                .map((c) => (
                  <div key={c.key} className="flex justify-between gap-3 text-sm">
                    <span className="text-[11px] font-mono uppercase text-muted-foreground shrink-0">{c.header}</span>
                    <span className="text-right min-w-0 break-words">{c.render(row)}</span>
                  </div>
                ))}
            </div>
          );
          return href ? (
            <Link key={row.id} href={href} className="block">
              {body}
            </Link>
          ) : (
            <div key={row.id}>{body}</div>
          );
        })}
      </div>
    </>
  );
}

export function Pager({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return <p className="text-xs text-muted-foreground mt-3">{total} total</p>;
  return (
    <div className="flex items-center justify-between mt-4 text-sm">
      <span className="text-xs text-muted-foreground">
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="px-3 py-1.5 rounded-lg border border-white/10 disabled:opacity-40 hover:bg-white/10">
          Previous
        </button>
        <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="px-3 py-1.5 rounded-lg border border-white/10 disabled:opacity-40 hover:bg-white/10">
          Next
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Filters                                                                   */
/* ------------------------------------------------------------------------ */

export function FilterTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/20 p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition-colors",
            value === o.value ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-white/5"
          )}
        >
          {o.label}
          {typeof o.count === "number" && <span className="ml-1 opacity-70">({o.count})</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary w-full md:w-72",
        className
      )}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Confirmation with reason                                                  */
/* ------------------------------------------------------------------------ */

export interface ConfirmRequest {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  /** Destructive / financial: red button, extra warning. */
  danger?: boolean;
  /** Whether a reason is required; almost always true in this console. */
  requireReason?: boolean;
  reasonLabel?: string;
  /** Extra fields rendered above the reason (e.g. a reference or a number). */
  fields?: Array<{ name: string; label: string; type?: "text" | "number" | "date"; placeholder?: string; required?: boolean; min?: number; max?: number }>;
  onConfirm: (values: { reason: string } & Record<string, string>) => Promise<unknown> | unknown;
}

export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirm = (r: ConfirmRequest) => setRequest(r);
  const dialog = request ? <ConfirmDialog request={request} onClose={() => setRequest(null)} /> : null;
  return { confirm, dialog };
}

function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const requireReason = request.requireReason ?? true;
  const missingField = (request.fields ?? []).some((f) => f.required && !values[f.name]?.trim());
  const canConfirm = (!requireReason || reason.trim().length >= 3) && !missingField && !busy;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await request.onConfirm({ reason: reason.trim(), ...values });
      onClose();
    } catch {
      /* the mutation already toasted */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-md glass-panel rounded-2xl p-6 space-y-4 border-white/15">
        <div className="flex items-start justify-between gap-3">
          <h2 id="confirm-title" className="text-lg font-bold flex items-center gap-2">
            {request.danger && <ShieldAlert className="w-5 h-5 text-red-400" />}
            {request.title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        {request.description && <div className="text-sm text-muted-foreground">{request.description}</div>}
        {request.danger && (
          <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
            This changes money or account standing. It is recorded in the audit log with your name and reason.
          </p>
        )}
        {(request.fields ?? []).map((f) => (
          <label key={f.name} className="block text-xs font-mono uppercase text-muted-foreground space-y-1">
            {f.label}
            <input
              type={f.type ?? "text"}
              value={values[f.name] ?? ""}
              min={f.min}
              max={f.max}
              placeholder={f.placeholder}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm normal-case font-sans focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        ))}
        {requireReason && (
          <label className="block text-xs font-mono uppercase text-muted-foreground space-y-1">
            {request.reasonLabel ?? "Reason (recorded)"}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm normal-case font-sans focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Why are you doing this? Minimum 5 characters."
            />
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/10">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canConfirm}
            className={cn(
              "px-4 py-2 text-sm rounded-lg font-bold text-white disabled:opacity-50 flex items-center gap-2",
              request.danger ? "bg-red-600 hover:bg-red-500" : "bg-primary hover:bg-primary/90"
            )}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {request.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small action button used throughout the console. */
export function ActionButton({
  children,
  onClick,
  tone = "default",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "default" | "primary" | "danger";
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        tone === "primary" && "bg-primary text-white border-primary hover:bg-primary/90",
        tone === "danger" && "bg-red-600/20 text-red-300 border-red-500/40 hover:bg-red-600/30",
        tone === "default" && "bg-white/5 border-white/10 hover:bg-white/10"
      )}
    >
      {children}
    </button>
  );
}
