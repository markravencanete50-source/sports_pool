import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { AuthVerifiedToast } from "@/components/auth/auth-verified-toast";

export const metadata: Metadata = {
  title: "Sports Pool - NFL Betting",
  description:
    "Join Private and Public NFL betting pools. Win big with your picks.",
  openGraph: {
    title: "Sports Pool - NFL Betting",
    description:
      "Join Private and Public NFL betting pools. Win big with your picks.",
    type: "website",
    images: ["/generated_images/logo.png"],
  },
  twitter: {
    card: "summary_large_image",
    site: "@replit",
    title: "Sports Pool - NFL Betting",
    description:
      "Join Private and Public NFL betting pools. Win big with your picks.",
    images: ["/generated_images/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
