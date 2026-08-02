"use client";

import Layout from "@/components/layout";
import { WhiteLabelHero } from "@/components/white-label/white-label-hero";
import { FeatureList } from "@/components/white-label/feature-list";
import { TrustedBySection } from "@/components/white-label/trusted-by-section";
import { WhiteLabelMockup } from "@/components/white-label/white-label-mockup";

export default function WhiteLabel() {
  const features = [
    "Custom branding, logo & color themes",
    "Dedicated support manager 24/7",
    "Advanced user analytics & export capabilities",
    "Integration with your existing authentication",
    "Custom domain (pools.yourcompany.com)",
    "No platform fees for your users",
    "Automated payouts & wallet integration",
  ];

  return (
    <Layout>
      <div className="space-y-8 pb-20">
        <div className="max-w-4xl mx-auto space-y-12">
          <WhiteLabelHero />

          {/* Feature Showcase */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-10">
            <div className="space-y-8">
              <FeatureList
                title="Why Go White Label?"
                features={features}
                className="bg-white border border-white/10 p-8 rounded-2xl shadow-xl"
              />

              <TrustedBySection />
            </div>

            <WhiteLabelMockup />
          </div>
        </div>
      </div>
    </Layout>
  );
}
