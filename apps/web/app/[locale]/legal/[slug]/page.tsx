import { ArrowLeftIcon } from "@radix-ui/react-icons";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { getLegalDoc, legalSlugs } from "@/lib/legal-content";

interface LegalPageProperties {
  readonly params: Promise<{
    slug: string;
  }>;
}

export const generateMetadata = async ({
  params,
}: LegalPageProperties): Promise<Metadata> => {
  const { slug } = await params;
  const doc = getLegalDoc(slug);

  if (!doc) {
    return {};
  }

  return createMetadata({
    title: doc.title,
    description: doc.intro,
  });
};

// Deliberately no generateStaticParams: every other route in this app
// renders dynamically (marked `ƒ` in the build output - only this route
// and blog/[slug] were `●` SSG), and mixing static generation into an
// otherwise fully-dynamic [locale]-nested tree threw a real production
// DYNAMIC_SERVER_USAGE error (seen in Vercel runtime logs from
// 2026-08-30 onward, predating this fix). Content is static data either
// way - dynamic rendering just means it's computed per-request instead
// of at build time, which is fine for 3 lightweight pages.

const LegalPage = async ({ params }: LegalPageProperties) => {
  const { slug } = await params;
  const doc = getLegalDoc(slug);

  if (!doc) {
    notFound();
  }

  return (
    <div className="container max-w-5xl px-4 py-16">
      <Link
        className="mb-4 inline-flex items-center gap-1 font-bold text-muted-foreground text-sm hover:text-primary focus:underline focus:outline-none"
        href="/"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Home
      </Link>
      <h1 className="font-display scroll-m-20 text-balance text-4xl tracking-tight lg:text-6xl">
        {doc.title}
      </h1>
      <p className="text-balance leading-7 [&:not(:first-child)]:mt-6">
        {doc.intro}
      </p>
      <div className="mt-16 flex flex-col items-start gap-8 sm:flex-row">
        <div className="sm:flex-1">
          <div className="prose prose-neutral dark:prose-invert max-w-none">
            {doc.body.map((section) => (
              <div className="mb-8" key={section.n}>
                <h2 className="flex items-baseline gap-3 text-xl">
                  <span className="font-normal text-muted-foreground text-sm">
                    {section.n}
                  </span>
                  {section.h}
                </h2>
                {section.p.split("\n\n").map((paragraph) => (
                  <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="sticky top-24 hidden shrink-0 md:block">
          <Sidebar date={new Date(doc.date)} readingTime="5 min read" toc={null} />
        </div>
      </div>
    </div>
  );
};

export default LegalPage;
