"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DASHBOARD_PATH } from "@/lib/routes";

/**
 * Route-level error boundary.
 *
 * Before this existed, an unhandled exception during render — a malformed API
 * payload, an undefined field on a pool, a date that fails to parse — took the
 * whole route down to Next.js's default error screen. On a product where people
 * are looking at their own money that is not merely ugly: a player who sees a
 * raw crash on the winnings or balance page cannot tell a display bug from
 * their funds having vanished, and support inherits that ambiguity.
 *
 * WHY error.message IS NOT SHOWN IN PRODUCTION
 *
 * Error text on the server side of this app routinely carries internals —
 * Supabase constraint names, Stripe session ids, PayPal batch failures, table
 * and column names from failed writes. React serialises errors thrown during
 * server rendering down to the client, so rendering the message verbatim would
 * publish that to anyone who can trigger the error. Next.js already redacts the
 * message in production builds and replaces it with `digest`; this component
 * relies on that and shows the digest instead, which is the correlation handle
 * an operator actually needs. The full message is shown in development only.
 *
 * OBSERVABILITY HOOK
 *
 * The console.error below is the current diagnostic surface and the seam where
 * an error reporter belongs. When Sentry (or equivalent) is added, capture the
 * error here — this boundary is the one place every client-side render failure
 * in the app is guaranteed to pass through.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error.digest ?? "(no digest)", error);
    // Ship the failure to /api/client-errors so it lands in app_errors and an
    // operator can see it. keepalive lets the report survive a navigation away
    // from the broken page; failures here are swallowed — the reporter must
    // never become a second error source.
    if (process.env.NODE_ENV === "production") {
      fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          message: error.message?.slice(0, 2000) || "(no message)",
          digest: error.digest,
          url: window.location.pathname,
        }),
      }).catch(() => {});
    }
  }, [error]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground px-4">
      <div className="glass-panel w-full max-w-md rounded-3xl p-8 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-8" aria-hidden="true" />
        </div>

        <h1 className="mt-6 text-2xl font-bold">Something went wrong</h1>

        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This page hit an unexpected error. Nothing you were looking at has been
          changed — your cards, picks and balance are safe. Try again, and if it
          keeps happening let us know.
        </p>

        {process.env.NODE_ENV === "development" && error.message ? (
          <pre className="mt-5 max-h-40 overflow-auto rounded-xl bg-muted/40 p-3 text-left text-xs leading-5 text-muted-foreground whitespace-pre-wrap break-words">
            {error.message}
          </pre>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            onClick={reset}
            className="min-h-11 px-6 font-semibold uppercase"
          >
            <RotateCcw />
            Try again
          </Button>
          <Button
            asChild
            variant="outline"
            className="min-h-11 px-6 font-semibold uppercase"
          >
            <Link href={DASHBOARD_PATH}>
              <ArrowLeft />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        {error.digest ? (
          <p className="mt-6 text-xs text-muted-foreground">
            Reference code:{" "}
            <span className="font-mono select-all">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
