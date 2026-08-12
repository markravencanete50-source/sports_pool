/**
 * Route-level suspense fallback. Every page in this app is server-rendered per
 * request (force-dynamic, required by the nonce CSP), so navigations always
 * have a server round-trip; without a loading boundary that time is a frozen
 * screen. Server component — no state, no handlers.
 */
export default function Loading() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-background text-foreground"
      role="status"
      aria-label="Loading page"
    >
      <div className="flex flex-col items-center gap-4">
        <div
          aria-hidden="true"
          className="size-10 rounded-full border-4 border-primary/25 border-t-primary animate-spin"
        />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}
