import { blog } from "@repo/cms";
import { Button } from "@repo/design-system/components/ui/button";
import type { Dictionary } from "@repo/internationalization";
import { MoveRight, PhoneCall } from "lucide-react";
import Link from "next/link";
import { env } from "@/env";

interface HeroProps {
  dictionary: Dictionary;
}

export const Hero = async ({ dictionary }: HeroProps) => {
  const latestPost = await blog.getLatestPost();
  // The BaseHub-generated `Post` type is only as good as the live schema
  // the connected repo currently has - it's drifted twice already (see
  // PRD.md §2 item 4/8) and the inferred type stopped including `_slug`,
  // hard-failing the build even though getLatestPost() already degrades
  // to null at runtime on any query mismatch. Read defensively through an
  // unknown cast rather than trust the schema-derived type here; this
  // still works correctly once the BaseHub repo's schema is fixed.
  const latestPostSlug = (latestPost as unknown as { _slug?: string } | null)
    ?._slug;

  return (
    <div className="w-full">
      <div className="container mx-auto">
        <div className="flex flex-col items-center justify-center gap-8 py-20 lg:py-40">
          {latestPostSlug && (
            <div>
              <Button asChild className="gap-4" size="sm" variant="secondary">
                <Link href={`/blog/${latestPostSlug}`}>
                  {dictionary.web.home.hero.announcement}{" "}
                  <MoveRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-4">
            <h1 className="max-w-2xl text-center font-regular text-5xl tracking-tighter md:text-7xl">
              {dictionary.web.home.meta.title}
            </h1>
            <p className="max-w-2xl text-center text-lg text-muted-foreground leading-relaxed tracking-tight md:text-xl">
              {dictionary.web.home.meta.description}
            </p>
          </div>
          <div className="flex flex-row gap-3">
            <Button asChild className="gap-4" size="lg" variant="outline">
              <Link href="/contact">
                Talk to us <PhoneCall className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild className="gap-4" size="lg">
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
