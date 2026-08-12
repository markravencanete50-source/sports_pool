import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not available in your location | Sports Pool",
  description: "Paid contests are not currently available in your location.",
  robots: { index: false, follow: false },
};

/*
 * Where the geo-restriction middleware rewrites to. Deliberately a plain,
 * self-contained page: it must render for someone whose whole authenticated
 * surface is closed to them, so it depends on no session, no data fetch and no
 * layout that assumes either.
 *
 * The tone matters. This person has done nothing wrong, and the reason they are
 * here is a licensing position rather than anything about them — so the copy
 * explains, points at the rules, and does not imply wrongdoing.
 */
export default function UnavailablePage() {
  return (
    <div className="dark">
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl text-center space-y-6">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Region restricted
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold">
            Paid contests aren&apos;t available in your location
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Contests with cash prizes on sporting outcomes are regulated
            differently from place to place. We don&apos;t currently offer them
            where you are, so we&apos;ve stopped you here rather than letting you
            enter something we can&apos;t honour.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            If you believe this is wrong — a VPN, a corporate proxy or a
            mislocated network can all cause it — turn those off and reload. If
            it persists, get in touch and we&apos;ll look into it.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/contact"
              className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
            >
              Contact support
            </Link>
            <Link
              href="/contest-rules"
              className="rounded-lg border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5 transition-colors"
            >
              Read the contest rules
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
