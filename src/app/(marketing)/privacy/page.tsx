import type { Metadata } from "next";
import { SitePageShell } from "@/components/marketing/site-page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy | Sports Pool",
  description:
    "Read the Sports Pool privacy policy to understand what information is collected and how it is used.",
};

const sections = [
  {
    title: "Information We Collect",
    paragraphs: [
      "We may collect account details, contact information, login activity, pool participation data, payment-related metadata, support communications, and standard device or browser information.",
      "Some information is provided directly by you, and some is collected automatically when you browse the website or use the product.",
    ],
    bullets: [
      "Registration details such as name and email address.",
      "Pool participation, invitations, picks, comments, and related account activity.",
      "Technical data such as browser type, IP address, device information, and page interactions.",
    ],
  },
  {
    title: "How We Use Information",
    paragraphs: [
      "We use information to operate the platform, manage accounts, process pool activity, communicate updates, prevent abuse, and improve the website.",
      "We may also use information for support requests, security monitoring, fraud prevention, analytics, and relevant product or marketing communications where permitted.",
    ],
  },
  {
    title: "Sharing And Service Providers",
    paragraphs: [
      "We may share information with service providers and infrastructure partners that help us run the platform, including hosting, authentication, database, analytics, and payment services.",
      "We may also disclose information when required by law, to protect users or the platform, or as part of a business transaction such as a merger or acquisition.",
    ],
  },
  {
    title: "Retention And Security",
    paragraphs: [
      "We retain information for as long as needed to operate the service, meet legal obligations, resolve disputes, and enforce agreements.",
      "We use reasonable administrative and technical safeguards, but no website or internet transmission can be guaranteed fully secure.",
    ],
  },
  {
    title: "Your Choices",
    paragraphs: [
      "You may be able to update account details, opt out of certain communications, or request deletion or correction of personal information depending on applicable law and operational requirements.",
      "If you want to make a privacy-related request, use the contact page so the request can be routed correctly.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <SitePageShell
      eyebrow="Privacy Policy"
      title="How Sports Pool handles your information."
      description="This page explains what we collect, why we collect it, and the choices you may have around your information."
      sections={sections}
      ctaTitle="Need a privacy-related request handled?"
      ctaDescription="Use the contact page to route account, privacy, and support questions through the right channel."
      ctaHref="/contact"
      ctaLabel="Contact Us"
    />
  );
}
