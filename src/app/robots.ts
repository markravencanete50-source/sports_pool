import type { MetadataRoute } from "next";

/**
 * Crawl guidance. Everything behind a session is disallowed — not as a
 * security control (RLS and route auth are that), but because a crawler
 * hitting authenticated routes only ever sees redirects and burns crawl
 * budget the public pages could use.
 */
export default function robots(): MetadataRoute.Robots {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/dashboard",
          "/create-pool",
          "/private-pools",
          "/invitations",
          "/my-games",
          "/winnings",
          "/pool/",
          "/auth/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
