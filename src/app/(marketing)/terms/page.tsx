import type { Metadata } from "next";
import { SitePageShell } from "@/components/marketing/site-page-shell";

export const metadata: Metadata = {
  title: "Terms & Conditions | Sports Pool",
  description:
    "Read the Sports Pool terms and conditions covering account use, pools, payments, and platform rules.",
};

const sections = [
  {
    title: "Acceptance Of Terms",
    paragraphs: [
      "By accessing or using Sports Pool, you agree to these Terms & Conditions and any additional rules posted on specific parts of the website or product.",
      "If you do not agree with these terms, you should not use the website, create an account, or participate in any pool activity.",
    ],
  },
  {
    title: "Accounts And Eligibility",
    paragraphs: [
      "You are responsible for keeping your account credentials secure and for all activity that happens under your account.",
      "You may only use the service if doing so is lawful in your location and if you are legally permitted to access sports-related gaming or pool products.",
    ],
    bullets: [
      "Provide accurate registration details and keep them up to date.",
      "Do not impersonate another person, brand, or organization.",
      "Do not use the platform for fraud, abuse, scraping, or any activity that harms other users.",
    ],
  },
  {
    title: "Pools, Entries, And Payments",
    paragraphs: [
      "Sports Pool may support public pools, private pools, paid entries, and organizer-managed experiences. Entry terms, prize structures, and participation limits may vary by pool.",
      "You are responsible for reviewing a pool's rules, fees, and format before joining. Payments, payout timing, and eligibility may depend on verification, moderation, and third-party processing.",
    ],
    bullets: [
      "Pool organizers may set additional rules for private or branded pools.",
      "Entry fees and payout timing may be affected by payment processor availability or review checks.",
      "We may suspend, cancel, or restrict pool activity where abuse, fraud, or operational risk is detected.",
    ],
  },
  {
    title: "Content, Conduct, And Availability",
    paragraphs: [
      "You retain responsibility for content you post or submit, including usernames, comments, and pool details. You must have the rights needed to share that content.",
      "We may remove content or restrict access where we believe content is unlawful, misleading, abusive, infringing, or harmful to the platform or its users.",
      "We do not guarantee uninterrupted service, error-free operation, or permanent availability of any specific feature, page, or pool.",
    ],
  },
  {
    title: "Limitation Of Liability",
    paragraphs: [
      "To the fullest extent allowed by law, Sports Pool is provided on an as-is and as-available basis without warranties of any kind.",
      "We are not liable for indirect, incidental, special, or consequential damages arising from your use of the website, participation in pools, payment issues, downtime, or third-party services.",
    ],
  },
];

export default function TermsPage() {
  return (
    <SitePageShell
      eyebrow="Terms & Conditions"
      title="Rules for using Sports Pool."
      description="These terms explain the basic conditions for using the website, creating accounts, joining pools, and interacting with the platform."
      sections={sections}
      ctaTitle="Want to see the product first?"
      ctaDescription="Browse public pools or create an account when you're ready to start participating."
      ctaHref="/public-pools"
      ctaLabel="Browse Public Pools"
    />
  );
}
