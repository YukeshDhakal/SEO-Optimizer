import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { env } from "@/env";
import { localeHref } from "@/lib/locale-href";

interface CTAProps {
  locale: string;
}

export const CTA = ({ locale }: CTAProps) => (
  <div className="flex w-full flex-col items-center gap-4 border-b-[3px] border-foreground bg-primary py-16 text-center">
    <h2 className="font-display max-w-2xl px-4 text-3xl tracking-tight md:text-5xl">
      Connect one site. Watch one run. Then decide.
    </h2>
    <p className="max-w-lg px-4 text-sm leading-relaxed md:text-base">
      Free plan, no card, and nothing reaches your site until you approve it.
    </p>
    <div className="flex flex-wrap justify-center gap-3">
      <Button asChild size="lg" variant="default">
        <Link href={`${env.NEXT_PUBLIC_APP_URL}/sign-up`}>Start free</Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href={localeHref(locale, "/contact")}>Talk to us</Link>
      </Button>
    </div>
  </div>
);
