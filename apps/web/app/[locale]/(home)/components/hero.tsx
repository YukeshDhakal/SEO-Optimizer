import { blog } from "@repo/cms";
import { Button } from "@repo/design-system/components/ui/button";
import { MoveRight, PhoneCall } from "lucide-react";
import Link from "next/link";
import { env } from "@/env";
import { localeHref } from "@/lib/locale-href";

interface HeroProps {
  locale: string;
}

const heroSteps = [
  { n: "01", label: "Research — 12 sources fetched", pct: "100%", color: "bg-brand-lime", meta: "done" },
  { n: "02", label: "Facts extracted to knowledge base", pct: "100%", color: "bg-brand-lime", meta: "done" },
  { n: "03", label: "Draft written against those facts", pct: "100%", color: "bg-brand-lime", meta: "done" },
  { n: "04", label: "Quality gates — 5 of 5 passed", pct: "100%", color: "bg-brand-lime", meta: "done" },
  { n: "05", label: "Waiting for your approval", pct: "45%", color: "bg-brand-yellow", meta: "4h" },
  { n: "06", label: "Publish to WordPress", pct: "0%", color: "bg-secondary", meta: "queued" },
];

// Hardcoded English copy, not dictionary-driven, matching Pricing's existing
// precedent - translating this much new marketing copy accurately into all
// 6 locales isn't something to auto-generate; a real translation pass is a
// separate follow-up. Old dictionary-driven hero copy is superseded.
export const Hero = async ({ locale }: HeroProps) => {
  const latestPost = await blog.getLatestPost();
  const latestPostSlug = latestPost?._slug;

  return (
    <div className="w-full border-b-[3px] border-foreground">
      <div className="container mx-auto grid gap-8 px-4 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-20">
        <div className="flex flex-col gap-5">
          <span className="w-fit border-[3px] border-foreground bg-brand-lime px-3 py-1 font-bold text-xs uppercase tracking-[0.08em]">
            New · Connect Claude, Cursor or ChatGPT to your own workspace
          </span>
          <h1 className="font-display text-4xl leading-[0.98] tracking-tight md:text-6xl">
            The autonomous SEO content agent that publishes straight to your
            CMS.
          </h1>
          <p className="max-w-xl text-base leading-relaxed md:text-lg">
            Quillrun researches from real sources, drafts against the facts
            it found, runs every piece through quality gates, holds for your
            approval, then publishes to WordPress, Shopify or Webflow. One
            button stops everything.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href={`${env.NEXT_PUBLIC_APP_URL}/sign-up`}>
                Start free — no card <MoveRight className="h-4 w-4" />
              </Link>
            </Button>
            {latestPostSlug ? (
              <Button asChild size="lg" variant="outline">
                <Link href={localeHref(locale, `/blog/${latestPostSlug}`)}>Watch a real run →</Link>
              </Button>
            ) : (
              <Button asChild size="lg" variant="outline">
                <Link href={localeHref(locale, "/contact")}>
                  Talk to us <PhoneCall className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
          <span className="font-mono text-muted-foreground text-xs">
            Free plan · connect a site in about a minute · nothing publishes
            without your say-so
          </span>
        </div>

        <div className="border-[3px] border-foreground bg-card shadow-[7px_7px_0_#111]">
          <div className="flex items-center gap-2 border-foreground border-b-[3px] bg-foreground px-3.5 py-2.5 text-background">
            <span className="h-2.5 w-2.5 animate-pulse border border-background bg-primary" />
            <span className="font-mono text-xs">example run · your-site.com</span>
          </div>
          <div className="flex flex-col gap-2.5 p-3.5">
            {heroSteps.map((step) => (
              <div className="flex items-center gap-2.5" key={step.n}>
                <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground">{step.n}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-bold text-xs">{step.label}</span>
                  <span className="block h-2 border-2 border-foreground bg-card">
                    <span className={`block h-full ${step.color}`} style={{ width: step.pct }} />
                  </span>
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                  {step.meta}
                </span>
              </div>
            ))}
            <div className="mt-1 border-[3px] border-foreground bg-brand-yellow px-2.5 py-2 font-bold text-xs">
              ◎ Holding at approval gate — 1 draft waiting on you
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
