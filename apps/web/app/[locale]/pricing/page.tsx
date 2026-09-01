import { Button } from "@repo/design-system/components/ui/button";
import { Check, MoveRight, PhoneCall } from "lucide-react";
import Link from "next/link";
import { env } from "@/env";
import { localeHref } from "@/lib/locale-href";

const plans = [
  { name: "Single site", price: "£49", unit: "per month", description: "One site, for an owner who writes nothing and wants a blog that moves.", cta: "Start free", items: ["8 posts a month", "WordPress or hosted blog", "Approval gate and audit log", "Email when a run needs you"] },
  { name: "Studio", price: "£39", unit: "per site, per month", description: "Three to ten client sites, one dashboard, one stop button over all of them.", cta: "Start free", featured: true, items: ["12 posts a month per site", "Cross-client overview", "Per-site schedules and limits", "Teammates and approval routing"] },
  { name: "Operations", price: "Talk to us", unit: "", description: "Eleven sites or more, or a compliance team that needs to see the gates.", cta: "Book a call", items: ["Custom volume and retention", "Policy and approval controls", "Priority implementation support", "Security review and SSO options"] },
];

interface PricingProps {
  params: Promise<{ locale: string }>;
}

const Pricing = async ({ params }: PricingProps) => {
  const { locale } = await params;
  const contactHref = localeHref(locale, "/contact");

  return (
  <main className="w-full py-20 lg:py-28">
    <section className="container mx-auto px-4">
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-3 font-bold text-muted-foreground text-sm uppercase tracking-[0.16em]">Pricing</p>
          <h1 className="font-display max-w-xl text-4xl leading-[0.98] tracking-tight md:text-6xl">
            Priced per site, not per word.
          </h1>
        </div>
        <div className="max-w-sm border-[3px] border-foreground bg-accent p-4 font-bold text-sm shadow-[6px_6px_0_#111]">
          Start with three free posts. Nothing publishes without a visible
          record of why it passed.
        </div>
      </div>
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => (
          <article
            className={`relative flex flex-col border-[3px] border-foreground p-6 shadow-[8px_8px_0_#111] transition-transform hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[12px_12px_0_#111] ${plan.featured ? "bg-primary" : "bg-card"}`}
            key={plan.name}
          >
            {plan.featured && (
              <span className="-top-4 absolute right-5 border-[3px] border-foreground bg-brand-yellow px-3 py-1 font-bold text-xs uppercase tracking-[0.1em]">
                Most agencies
              </span>
            )}
            <p className="font-bold text-xs uppercase tracking-[0.14em]">{plan.name}</p>
            <p className="font-display mt-4 text-5xl tracking-tight">{plan.price}</p>
            {plan.unit && <p className="mt-1 font-semibold text-sm">{plan.unit}</p>}
            <p className="mt-4 min-h-16 text-sm leading-relaxed">{plan.description}</p>
            <Button
              asChild
              className="mt-6 gap-2"
              variant={plan.featured ? "default" : "outline"}
            >
              <Link href={plan.name === "Operations" ? contactHref : `${env.NEXT_PUBLIC_APP_URL}/sign-up`}>
                {plan.cta}
                {plan.name === "Operations" ? <PhoneCall className="h-4 w-4" /> : <MoveRight className="h-4 w-4" />}
              </Link>
            </Button>
            <ul className="mt-7 space-y-3 border-t-[3px] border-foreground pt-6 text-sm font-medium">
              {plan.items.map((item) => (
                <li className="flex gap-2" key={item}>
                  <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  </main>
  );
};

export default Pricing;
