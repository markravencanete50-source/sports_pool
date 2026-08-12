"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary.
 *
 * error.tsx renders INSIDE the root layout, so it cannot catch a failure in the
 * root layout itself — the font loader, the theme provider, the query client,
 * anything in Providers. When that happens Next.js discards the whole tree and
 * renders this file in its place, which is why it must supply its own <html>
 * and <body>: there is no layout left to provide them.
 *
 * NO DESIGN SYSTEM IN HERE, DELIBERATELY.
 *
 * Everything is inline. Tailwind classes, the ui/button component and
 * globals.css are all reached through the same layout that just failed, so
 * depending on them risks this boundary failing for the very reason it was
 * invoked — and a blank page is the one outcome worse than an ugly one. The
 * colours are hardcoded to match the app's dark theme (themeColor #0d1326 in
 * the root viewport export) so it does not flash white.
 *
 * A full reload rather than reset() alone: if the root layout failed to
 * construct, re-rendering the same tree usually reproduces it, whereas a fresh
 * document gets a clean provider graph.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error-boundary]", error.digest ?? "(no digest)", error);
    // Same intake as error.tsx. This boundary means the root layout itself
    // failed, so keep the report dependency-free and best-effort.
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          backgroundColor: "#0d1326",
          color: "#e8ecf6",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: "28rem",
            textAlign: "center",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "1.5rem",
            padding: "2rem",
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>
            Something went wrong
          </h1>

          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "rgba(232,236,246,0.72)",
            }}
          >
            The app failed to load. Nothing you were looking at has been changed
            — your cards, picks and balance are safe. Reloading usually clears
            it.
          </p>

          <button
            onClick={() => {
              reset();
              window.location.reload();
            }}
            style={{
              marginTop: "2rem",
              minHeight: "2.75rem",
              padding: "0 1.5rem",
              width: "100%",
              cursor: "pointer",
              borderRadius: "0.75rem",
              border: "none",
              backgroundColor: "#f43f5e",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            Reload the app
          </button>

          {error.digest ? (
            <p
              style={{
                marginTop: "1.5rem",
                marginBottom: 0,
                fontSize: "0.75rem",
                color: "rgba(232,236,246,0.55)",
              }}
            >
              Reference code:{" "}
              <span style={{ fontFamily: "ui-monospace, monospace" }}>
                {error.digest}
              </span>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
