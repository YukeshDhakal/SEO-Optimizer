import { Button } from "@repo/design-system/components/ui/button";
import { Check, MoveRight, PhoneCall } from "lucide-react";
import Link from "next/link";
import { env } from "@/env";

const plans = [
  { name: "Single site", price: "£49", unit: "per month", description: "One site, for an owner who writes nothing and wants a blog that moves.", cta: "Start free", items: ["8 posts a month", "WordPress or hosted blog", "Approval gate and audit log", "Email when a run needs you"] },
  { name: "Studio", price: "£39", unit: "per site, per month", description: "Three to ten client sites, one dashboard, one stop button over all of them.", cta: "Start free", featured: true, items: ["12 posts a month per site", "Cross-client overview", "Per-site schedules and limits", "Teammates and approval routing"] },
  { name: "Operations", price: "Talk to us", unit: "", description: "Eleven sites or more, or a compliance team that needs to see the gates.", cta: "Book a call", items: ["Custom volume and retention", "Policy and approval controls", "Priority implementation support", "Security review and SSO options"] },
];

const Pricing = () => (
  <main className="w-full py-20 lg:py-32">
    <section className="container mx-auto">
      <p className="mb-3 font-medium text-muted-foreground text-sm uppercase tracking-[0.16em]">Pricing</p>
      <h1 className="max-w-xl font-semibold text-4xl tracking-tight md:text-5xl">Priced per site, not per word.</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground leading-relaxed">Start with three free posts. Approval is required by default, and nothing publishes without a visible record of why it passed.</p>
      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <article className={`relative flex flex-col rounded-xl border p-6 ${plan.featured ? "border-primary shadow-sm" : ""}`} key={plan.name}>
            {plan.featured && <span className="absolute -top-3 right-5 rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground text-xs">Most agencies</span>}
            <h2 className="font-semibold text-2xl">{plan.name}</h2>
            <p className="mt-3 min-h-20 text-muted-foreground text-sm leading-relaxed">{plan.description}</p>
            <p className="mt-6 font-semibold text-3xl">{plan.price}{plan.unit && <span className="ml-2 font-normal text-muted-foreground text-sm">{plan.unit}</span>}</p>
            <Button asChild className="mt-6 gap-2" variant={plan.featured ? "default" : "outline"}>
              <Link href={plan.name === "Operations" ? "/contact" : `${env.NEXT_PUBLIC_APP_URL}/sign-up`}>
                {plan.cta}{plan.name === "Operations" ? <PhoneCall className="h-4 w-4" /> : <MoveRight className="h-4 w-4" />}
              </Link>
            </Button>
            <ul className="mt-7 space-y-3 border-t pt-6 text-sm">
              {plan.items.map((item) => <li className="flex gap-2" key={item}><Check aria-hidden="true" className="mt-0.5 h-4 w-4 text-primary" />{item}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  </main>
);

export default Pricing;
