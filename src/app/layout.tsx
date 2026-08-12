import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

/*
 * Required by the nonce-based CSP (src/lib/csp.ts).
 *
 * A per-request nonce cannot authorise a statically pre-rendered page: the HTML
 * is baked at build time with no nonce, while the middleware sends a fresh one
 * on every response, so the browser refuses every inline script and the page
 * never hydrates. Rendering per request is what lets Next.js stamp the current
 * nonce onto its bootstrap scripts.
 */
export const dynamic = "force-dynamic";
import { Suspense } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { AuthVerifiedToast } from "@/components/auth/auth-verified-toast";

/*
 * Fonts are self-hosted from src/app/fonts rather than fetched with
 * next/font/google.
 *
 * next/font/google downloads the font at BUILD time, which makes every build —
 * CI and production deploy alike — depend on fonts.googleapis.com being
 * reachable. That is not theoretical: CI failed on 2026-08-12 with
 * "NextFontError: Failed to fetch `Inter` from Google Fonts" on a commit that
 * touched nothing but a document generator. A build that can fail for reasons
 * unrelated to its inputs is a build you cannot read, and on this project a
 * failed build is also a blocked deploy.
 *
 * Each file is the LATIN subset of the family's variable font, which is what
 * Google serves for these three — so one file covers the whole weight range
 * and the per-weight files it appears to offer are the same bytes repeated.
 * Declaring the range here rather than shipping five identical copies keeps
 * the payload at 85KB for all three families.
 *
 * The rendered result is unchanged: same families, same weights, same
 * swap behaviour, same CSS variables.
 */
const inter = localFont({
  src: [{ path: "./fonts/Inter-variable.woff2", style: "normal" }],
  weight: "300 700",
  variable: "--font-inter",
  display: "swap",
});

const oswald = localFont({
  src: [{ path: "./fonts/Oswald-variable.woff2", style: "normal" }],
  weight: "400 700",
  variable: "--font-oswald",
  display: "swap",
});

const teko = localFont({
  src: [{ path: "./fonts/Teko-variable.woff2", style: "normal" }],
  weight: "400 700",
  variable: "--font-teko",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sports Pool - NFL Betting",
  description:
    "Join Private and Public NFL betting pools. Win big with your picks.",
  openGraph: {
    title: "Sports Pool - NFL Betting",
    description:
      "Join Private and Public NFL betting pools. Win big with your picks.",
    type: "website",
    images: ["/generated_images/futuristic_3d_neon_american_football_logo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sports Pool - NFL Betting",
    description:
      "Join Private and Public NFL betting pools. Win big with your picks.",
    images: ["/generated_images/futuristic_3d_neon_american_football_logo.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d1326",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${oswald.variable} ${teko.variable}`}
    >
      <body>
        <Providers>
          <Suspense fallback={null}>
            <AuthVerifiedToast />
          </Suspense>
          {children}
        </Providers>
      </body>
    </html>
  );
}
