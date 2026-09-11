"use client";

import { useEffect, useState } from "react";
import { Share2, Copy, MessageSquare, Mail, QrCode, Check, X } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

/**
 * Share a pool: copy link, SMS, email, QR code — and the native share sheet
 * where the browser has one. The link is the pool's share slug, which is
 * public by construction; the pool's password (if any) is never included.
 */
export function SharePoolButton({
  shareSlug,
  poolName,
  className,
}: {
  shareSlug: string | null | undefined;
  poolName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined" && shareSlug
      ? `${window.location.origin}/p/${shareSlug}`
      : "";
  const text = `Join my SportsPool pool "${poolName}": ${url}`;

  useEffect(() => {
    if (!open || !url || qr) return;
    let cancelled = false;
    import("qrcode")
      .then((mod) =>
        mod.toDataURL(url, { width: 240, margin: 1, color: { dark: "#0b1220", light: "#ffffff" } })
      )
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not render the QR code");
      });
    return () => {
      cancelled = true;
    };
  }, [open, url, qr]);

  if (!shareSlug) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed — long-press the link to copy it");
    }
  };

  const nativeShare = async () => {
    if (typeof navigator.share !== "function") {
      setOpen(true);
      return;
    }
    try {
      await navigator.share({ title: poolName, text, url });
    } catch {
      /* user dismissed the sheet */
    }
  };

  return (
    <div className={className}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10"
          aria-expanded={open}
        >
          <Share2 className="w-4 h-4" /> Share
        </button>
        {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
          <button
            type="button"
            onClick={nativeShare}
            className="px-3 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 sm:hidden"
            aria-label="Share via device"
          >
            …
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 glass-panel rounded-xl p-4 space-y-3" role="dialog" aria-label="Share this pool">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-muted-foreground">Invite link</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close share panel">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono"
              aria-label="Share link"
            />
            <button
              type="button"
              onClick={copy}
              className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold flex items-center gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <a
              href={`sms:?&body=${encodeURIComponent(text)}`}
              className="flex items-center justify-center gap-1 px-2 py-2 rounded-lg border border-white/10 hover:bg-white/10"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Text
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(`Join my pool: ${poolName}`)}&body=${encodeURIComponent(text)}`}
              className="flex items-center justify-center gap-1 px-2 py-2 rounded-lg border border-white/10 hover:bg-white/10"
            >
              <Mail className="w-3.5 h-3.5" /> Email
            </a>
            <span className="flex items-center justify-center gap-1 px-2 py-2 rounded-lg border border-white/10 text-muted-foreground">
              <QrCode className="w-3.5 h-3.5" /> QR
            </span>
          </div>
          <div className="flex justify-center">
            {qr ? (
              <Image
                src={qr}
                unoptimized
                alt={`QR code linking to ${poolName}`}
                width={180}
                height={180}
                className="rounded-lg bg-white p-2"
              />
            ) : (
              <div className="w-[180px] h-[180px] rounded-lg skeleton" aria-hidden="true" />
            )}
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            Anyone with the link can find the pool. Private pools still need the password or an invitation.
          </p>
        </div>
      )}
    </div>
  );
}
