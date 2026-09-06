import { redirect } from "next/navigation";
import { localeHref } from "@/lib/locale-href";

interface PricingProps {
  params: Promise<{ locale: string }>;
}

// /pricing taken offline at the user's request - the new 4-tier $ pricing
// (still in git history from the previous commit) is proposed, not final,
// and shouldn't be publicly visible until the real numbers are confirmed.
// Redirects to Contact rather than 404ing or showing the old £ pricing,
// so a visitor following a Pricing link still reaches a real page.
const Pricing = async ({ params }: PricingProps) => {
  const { locale } = await params;
  redirect(localeHref(locale, "/contact"));
};

export default Pricing;
