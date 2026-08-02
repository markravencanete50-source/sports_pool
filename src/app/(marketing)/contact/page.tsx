import type { Metadata } from "next";
import { SitePageShell } from "@/components/marketing/site-page-shell";

export const metadata: Metadata = {
  title: "Contact | Sports Pool",
  description:
    "Contact Sports Pool for support, organizer questions, privacy requests, or white-label inquiries.",
};

const sections = [
  {
    title: "General Support",
    paragraphs: [
      "Use this page as the standard contact destination for account questions, product issues, or requests that are not handled directly inside the app.",
      "If you already have an account, logging in first can help you reach the relevant pool, payout, or participation context faster.",
    ],
    bullets: [
      "Login and account access issues.",
      "Pool participation or invitation questions.",
      "General product or website support requests.",
    ],
  },
  {
    title: "Organizer And White-Label Inquiries",
    paragraphs: [
      "If you want to launch a branded experience, manage a private community pool program, or explore white-label usage, use the white-label page as the main commercial entry point.",
      "That path is better suited for organizer conversations than the regular player signup flow.",
    ],
  },
  {
    title: "Privacy And Policy Requests",
    paragraphs: [
      "If you have a privacy, policy, or data-handling question, reference the relevant policy page and include enough detail for the request to be reviewed accurately.",
      "Requests may include account deletion, correction requests, or questions about information handling and retention.",
    ],
  },
  {
    title: "Before You Reach Out",
    bullets: [
      "Review the Terms, Privacy, and Cookie pages if your question is policy-related.",
      "Use the dashboard and pool pages for product context where possible.",
      "Use the white-label page for business or branded deployment discussions.",
    ],
  },
];

export default function ContactPage() {
  return (
    <SitePageShell
      eyebrow="Contact"
      title="The standard contact page for support, policy, and organizer questions."
      description="Whether you need help with an account, want to ask about white-label usage, or have a policy-related request, this page is the public starting point."
      sections={sections}
      ctaTitle="Looking for the organizer path?"
      ctaDescription="If your interest is business, community, or white-label focused, go straight to the dedicated page."
      ctaHref="/white-label"
      ctaLabel="View White Label"
    />
  );
}
