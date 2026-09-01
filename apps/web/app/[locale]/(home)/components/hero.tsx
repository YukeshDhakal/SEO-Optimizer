import { blog } from "@repo/cms";
import { Button } from "@repo/design-system/components/ui/button";
import type { Dictionary } from "@repo/internationalization";
import { MoveRight, PhoneCall } from "lucide-react";
import Link from "next/link";
import { env } from "@/env";
import { localeHref } from "@/lib/locale-href";

interface HeroProps {
  dictionary: Dictionary;
  locale: string;
}

export const Hero = async ({ dictionary, locale }: HeroProps) => {
  // Always null for now - packages/cms is no longer BaseHub-schema-driven
  // (see its index.ts and PRD.md §2). Drop-in ready for a real content
  // backend later; nothing else needs to change on this page when that
  // happens.
  const latestPost = await blog.getLatestPost();
  const latestPostSlug = latestPost?._slug;

  return (
    <div className="w-full border-b-[3px] border-foreground">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-center gap-7 py-16 lg:py-24">
          {latestPostSlug && (
            <Link
              className="inline-flex items-center gap-2 border-[3px] border-foreground bg-accent px-3.5 py-1.5 font-bold text-sm"
              href={localeHref(locale, `/blog/${latestPostSlug}`)}
            >
              {dictionary.web.home.hero.announcement}
              <MoveRight className="h-4 w-4" />
            </Link>
          )}
          <div className="flex flex-col gap-5">
            <h1 className="font-display max-w-3xl text-center text-5xl leading-[0.96] tracking-tight md:text-7xl">
              {dictionary.web.home.meta.title}
            </h1>
            <p className="max-w-2xl text-center text-lg leading-relaxed md:text-xl">
              {dictionary.web.home.meta.description}
            </p>
          </div>
          <div className="flex flex-row gap-4">
            <Button asChild className="gap-2" size="lg" variant="outline">
              <Link href={localeHref(locale, "/contact")}>
                Talk to us <PhoneCall className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild className="gap-2" size="lg">
              <Link href={`${env.NEXT_PUBLIC_APP_URL}/sign-up`}>
                Start free <MoveRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
