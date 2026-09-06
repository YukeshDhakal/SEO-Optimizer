import { Button } from "@repo/design-system/components/ui/button";
import { Check, Minus, MoveRight, PhoneCall } from "lucide-react";
import Link from "next/link";
import { env } from "@/env";
import { localeHref } from "@/lib/locale-href";

// Metered on published posts + MCP calls instead of seats/sites - per the
// Quillrun Site Redesign design doc's own pricing argument: per-seat pricing
// punishes agencies, per-word pricing makes people avoid the quality/approval
// gates. Numbers are explicitly proposed, not final - see the badge below.
interface Plan {
  readonly name: string;
  readonly price: string;
  readonly cadence: string;
  readonly tagline: string;
  readonly cta: string;
  readonly bg: string;
  readonly popular?: boolean;
  readonly limits: readonly (readonly [string, string])[];
  readonly has: readonly string[];
  readonly hasnt: readonly string[];
}

const plans: readonly Plan[] = [
  {
    name: "FREE",
    price: "$0",
    cadence: "forever",
    tagline: "Prove it on one site.",
    cta: "Start free",
    bg: "bg-card",
    limits: [
      ["Sites", "1"],
      ["Posts / month", "4"],
      ["Seats", "1"],
      ["MCP keys", "1 · 2k calls"],
    ],
    has: ["Grounded research", "All 5 quality gates", "Approval gate", "WordPress publishing"],
    hasnt: ["Recommendations", "Shopify & Webflow", "Audit log export"],
  },
  {
    name: "STARTER",
    price: "$39",
    cadence: "per month",
    tagline: "One site, on a schedule.",
    cta: "Start free trial",
    bg: "bg-card",
    limits: [
      ["Sites", "1"],
      ["Posts / month", "20"],
      ["Seats", "3"],
      ["MCP keys", "3 · 25k calls"],
    ],
    has: ["Everything in Free", "All three CMSes", "SEO recommendations", "Scheduling & auto-publish"],
    hasnt: ["Audit log export", "Multi-org"],
  },
  {
    name: "GROWTH",
    price: "$99",
    cadence: "per month",
    tagline: "The one most teams land on.",
    cta: "Start free trial",
    bg: "bg-brand-yellow",
    popular: true,
    limits: [
      ["Sites", "5"],
      ["Posts / month", "100"],
      ["Seats", "10"],
      ["MCP keys", "10 · 250k calls"],
    ],
    has: ["Everything in Starter", "Product page optimization", "Audit log + export", "Custom quality gates", "Priority support"],
    hasnt: ["Multi-org billing"],
  },
  {
    name: "AGENCY",
    price: "$299",
    cadence: "per month",
    tagline: "One dashboard, many clients.",
    cta: "Talk to us",
    bg: "bg-card",
    limits: [
      ["Sites", "25"],
      ["Posts / month", "400"],
      ["Seats", "Unlimited"],
      ["MCP keys", "Unlimited"],
    ],
    has: ["Everything in Growth", "One org per client", "Per-client keys & limits", "White-label reports", "Shared SLA"],
    hasnt: [],
  },
];

const everyPlan = [
  "Kill switch",
  "Approval gates",
  "All 5 quality gates",
  "Grounded research",
  "Auto-pause on failures",
  "Your data stays yours",
];

const priceFaq = [
  {
    q: "What counts as a post?",
    a: "One published piece of content. Drafts that fail a gate, get rejected at approval, or are regenerated don't count — you're billed for what reaches your site.",
  },
  {
    q: "Do MCP calls come out of my post allowance?",
    a: "No. Calls and posts meter separately, and each key carries its own monthly call cap you set.",
  },
  {
    q: "What happens if I go over?",
    a: "Runs pause rather than auto-billing. You'll see it in the status bar and can raise the plan or wait for the period to reset.",
  },
  {
    q: "Can agencies bill clients separately?",
    a: "On Agency, each client is its own org with its own usage line, so you can rebill from the usage export.",
  },
];

interface PricingProps {
  params: Promise<{ locale: string }>;
}

const Pricing = async ({ params }: PricingProps) => {
  const { locale } = await params;
  const contactHref = localeHref(locale, "/contact");

  return (
    <main className="w-full py-20 lg:py-28">
      <section className="container mx-auto flex flex-col items-center gap-4 px-4 text-center">
        <h1 className="font-display max-w-2xl text-4xl leading-[1.02] tracking-tight md:text-6xl">
          You pay for what reaches your site.
        </h1>
        <p className="max-w-xl text-base leading-relaxed md:text-lg">
          Drafts that fail a gate or get rejected at approval cost nothing.
          Every plan includes the full loop — research, gates, approval,
          publishing — the tiers only change volume.
        </p>
        <span className="inline-flex items-center gap-2 border-[3px] border-foreground bg-brand-yellow px-3 py-1 font-bold text-xs uppercase tracking-[0.1em]">
          Proposed pricing — confirm before launch
        </span>
      </section>

      <section className="container mx-auto mt-12 grid gap-4 px-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <article
            className={`flex flex-col border-[3px] border-foreground shadow-[6px_6px_0_#111] ${plan.bg}`}
            key={plan.name}
          >
            <div className="flex flex-col gap-2 border-foreground border-b-[3px] p-4">
              <span className="flex items-center gap-2">
                <span className="font-display text-sm tracking-wide">{plan.name}</span>
                {plan.popular && (
                  <span className="border-2 border-foreground bg-foreground px-1.5 py-0.5 font-bold text-[10px] text-background">
                    MOST TEAMS
                  </span>
                )}
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="font-display text-3xl tracking-tight">{plan.price}</span>
                <span className="font-mono text-muted-foreground text-xs">{plan.cadence}</span>
              </span>
              <span className="font-semibold text-sm">{plan.tagline}</span>
              <Button asChild className="mt-1" size="sm" variant={plan.popular ? "default" : "outline"}>
                <Link href={plan.cta === "Talk to us" ? contactHref : `${env.NEXT_PUBLIC_APP_URL}/sign-up`}>
                  {plan.cta}
                  {plan.cta === "Talk to us" ? <PhoneCall className="h-4 w-4" /> : <MoveRight className="h-4 w-4" />}
                </Link>
              </Button>
            </div>

            <div className="flex flex-col gap-1.5 border-foreground border-b-[3px] p-4">
              {plan.limits.map(([label, value]) => (
                <span className="flex items-baseline justify-between gap-2 text-xs" key={label}>
                  <span className="font-mono text-muted-foreground">{label}</span>
                  <span className="font-bold">{value}</span>
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-1.5 p-4 text-xs">
              {plan.has.map((item) => (
                <span className="flex items-start gap-2" key={item}>
                  <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {item}
                </span>
              ))}
              {plan.hasnt.map((item) => (
                <span className="flex items-start gap-2 text-muted-foreground" key={item}>
                  <Minus aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {item}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="container mx-auto mt-6 flex flex-wrap items-center gap-4 border-[3px] border-foreground bg-muted px-6 py-5">
        <span className="font-display text-sm">Every plan, no exceptions:</span>
        <span className="flex flex-wrap gap-2">
          {everyPlan.map((item) => (
            <span className="border-2 border-foreground bg-card px-2.5 py-1 font-bold text-xs" key={item}>
              {item}
            </span>
          ))}
        </span>
      </section>

      <section className="container mx-auto mt-14 grid gap-8 px-4 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-2xl tracking-tight">Billing questions</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            The metering answer is the one that decides the sale.
          </p>
        </div>
        <div className="flex flex-col">
          {priceFaq.map((f) => (
            <div className="flex flex-col gap-1 border-border/60 border-t py-4" key={f.q}>
              <span className="font-bold text-sm">{f.q}</span>
              <span className="text-muted-foreground text-sm leading-relaxed">{f.a}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
};

export default Pricing;
