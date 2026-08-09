import type { Metadata, Viewport } from "next";
import { Inter, Oswald, Teko } from "next/font/google";

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

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-oswald",
  display: "swap",
});

const teko = Teko({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
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
