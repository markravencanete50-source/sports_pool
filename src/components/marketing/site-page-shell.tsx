import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BackgroundLayer } from "@/components/layout/background-layer";
import { LandingFooter } from "@/components/marketing/landing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { Button } from "@/components/ui/button";

type SitePageSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

type SitePageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  sections: SitePageSection[];
  ctaTitle?: string;
  ctaDescription?: string;
  ctaHref?: string;
  ctaLabel?: string;
};

export function SitePageShell({
  eyebrow,
  title,
  description,
  sections,
  ctaTitle = "Ready to jump in?",
  ctaDescription = "Create an account, explore public pools, or contact the team if you need help getting set up.",
  ctaHref = "/signup",
  ctaLabel = "Create Account",
}: SitePageShellProps) {
  return (
    <div className="dark">
      <div className="relative min-h-screen bg-background text-foreground">
        <BackgroundLayer />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>

        <MarketingHeader />

        <main id="main-content" className="relative z-10">
          <section className="border-b border-white/10 py-16 sm:py-20">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
                {eyebrow}
              </div>
              <h1 className="mt-6 max-w-4xl text-5xl font-black italic leading-[0.95] sm:text-6xl">
                {title}
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">
                {description}
              </p>
            </div>
          </section>

          <section className="py-14 sm:py-16">
            <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
              <div className="space-y-6">
                {sections.map((section) => (
                  <article
                    key={section.title}
                    className="glass-panel rounded-3xl p-6 sm:p-8"
                  >
                    <h2 className="text-2xl font-black italic sm:text-3xl">
                      {section.title}
                    </h2>
                    {section.paragraphs?.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="mt-4 text-base leading-8 text-muted-foreground"
                      >
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets?.length ? (
                      <ul className="mt-5 space-y-3 text-base leading-8 text-muted-foreground">
                        {section.bullets.map((bullet) => (
                          <li
                            key={bullet}
                            className="flex items-start gap-3"
                          >
                            <span className="mt-3 h-1.5 w-1.5 rounded-full bg-primary" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ))}
              </div>

              <aside className="lg:sticky lg:top-24 lg:self-start">
                <div className="rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/12 via-black/55 to-black/75 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.22)]">
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">
                    Need Something Else?
                  </p>
                  <h2 className="mt-4 text-3xl font-black italic">
                    {ctaTitle}
                  </h2>
                  <p className="mt-4 text-base leading-7 text-muted-foreground">
                    {ctaDescription}
                  </p>
                  <div className="mt-6 flex flex-col gap-3">
                    <Button
                      asChild
                      className="min-h-12 w-full justify-center font-semibold uppercase"
                    >
                      <Link href={ctaHref}>
                        {ctaLabel}
                        <ArrowRight />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="min-h-12 w-full justify-center font-semibold uppercase"
                    >
                      <Link href="/contact">Contact Us</Link>
                    </Button>
                  </div>
                </div>
              </aside>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </div>
  );
}
