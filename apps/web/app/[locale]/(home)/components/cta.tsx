import { Button } from "@repo/design-system/components/ui/button";
import type { Dictionary } from "@repo/internationalization";
import { MoveRight, PhoneCall } from "lucide-react";
import Link from "next/link";
import { env } from "@/env";
import { localeHref } from "@/lib/locale-href";

interface CTAProps {
  dictionary: Dictionary;
  locale: string;
}

export const CTA = ({ dictionary, locale }: CTAProps) => (
  <div className="w-full bg-primary py-16 lg:py-20">
    <div className="container mx-auto flex flex-col items-center gap-8 px-4 text-center">
      <div className="flex flex-col gap-3">
        <h2 className="font-display max-w-2xl text-4xl leading-[1.02] tracking-tight md:text-6xl">
          {dictionary.web.home.cta.title}
        </h2>
        <p className="max-w-xl text-lg leading-relaxed">
          {dictionary.web.home.cta.description}
        </p>
      </div>
      <div className="flex flex-row gap-4">
        <Button asChild className="gap-2" variant="outline">
          <Link href={localeHref(locale, "/contact")}>
            {dictionary.web.global.primaryCta}
            <PhoneCall className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          asChild
          className="gap-2 border-foreground bg-foreground text-background shadow-[6px_6px_0_#FFFCF2] hover:shadow-[9px_9px_0_#FFFCF2] active:shadow-[2px_2px_0_#FFFCF2]"
        >
          <Link href={env.NEXT_PUBLIC_APP_URL}>
            {dictionary.web.global.secondaryCta}
            <MoveRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  </div>
);
