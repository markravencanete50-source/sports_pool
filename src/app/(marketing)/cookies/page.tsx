import type { Metadata } from "next";
import { SitePageShell } from "@/components/marketing/site-page-shell";

export const metadata: Metadata = {
  title: "Cookie Policy | Sports Pool",
  description:
    "Read the Sports Pool cookie policy for details about site preferences, analytics, and essential website functionality.",
};

const sections = [
  {
    title: "Why We Use Cookies",
    paragraphs: [
      "Cookies and similar technologies help the website remember sessions, maintain sign-in state, support security, and improve the browsing experience.",
      "We may also use them to understand how visitors move through the site so we can improve pages, flows, and performance.",
    ],
  },
  {
    title: "Types Of Cookies",
    bullets: [
      "Essential cookies used for authentication, security, and basic platform functionality.",
      "Preference cookies used to remember settings or reduce repeated actions.",
      "Analytics or measurement cookies used to understand traffic and improve the public website and product experience.",
    ],
  },
  {
    title: "Managing Cookies",
    paragraphs: [
      "Most browsers let you control, block, or delete cookies through browser settings. If you disable certain cookies, parts of the website or authenticated experience may not work as expected.",
      "Cookie controls can affect login persistence, account flows, and other features that depend on secure session handling.",
    ],
  },
  {
    title: "Third-Party Services",
    paragraphs: [
      "Some third-party services used for hosting, authentication, analytics, or payments may place or read cookies as part of their integration with the website.",
      "Their use of cookies may be governed by their own policies in addition to this website policy.",
    ],
  },
];

export default function CookiesPage() {
  return (
    <SitePageShell
      eyebrow="Cookie Policy"
      title="How cookies are used across the website."
      description="This page covers essential cookies, preferences, and usage patterns that support the public site and authenticated experience."
      sections={sections}
      ctaTitle="Prefer to browse first?"
      ctaDescription="You can still explore public pages and review the website before creating an account."
      ctaHref="/"
      ctaLabel="Back To Home"
    />
  );
}
