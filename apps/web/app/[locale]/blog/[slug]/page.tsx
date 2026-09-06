import { blog } from "@repo/cms";
import { Button } from "@repo/design-system/components/ui/button";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { env } from "@/env";
import { localeHref } from "@/lib/locale-href";

interface BlogPostProperties {
  readonly params: Promise<{
    locale: string;
    slug: string;
  }>;
}

export const generateMetadata = async ({
  params,
}: BlogPostProperties): Promise<Metadata> => {
  const { slug } = await params;
  const post = await blog.getPost(slug);

  if (!post) {
    return {};
  }

  return createMetadata({
    title: post._title,
    description: post.description,
    image: post.image.url,
  });
};

// blog.getPost() always resolves null for now - see packages/cms/index.ts.
// No real posts exist, so every slug still 404s until a real content
// backend is connected. The body render below stays a thin plainText
// passthrough rather than a rich renderer (same reasoning as before - a
// full renderer is something to build once there's a real body.json shape
// to render, not before). The sidebar (sources / run provenance / CTA) is
// genuinely new template work for when that day comes.
const BlogPost = async ({ params }: BlogPostProperties) => {
  const { locale, slug } = await params;
  const post = await blog.getPost(slug);

  if (!post) {
    notFound();
  }

  const category = post.categories[0]?._title ?? "Writing";

  return (
    <main className="w-full py-10 lg:py-14">
      <div className="container mx-auto flex flex-col gap-6 px-4 font-mono text-muted-foreground text-xs lg:flex-row lg:items-center lg:gap-1.5">
        <span>Blog</span>
        <span>/</span>
        <span>{category}</span>
        <span>/</span>
        <span className="font-bold text-foreground">{post._title}</span>
      </div>

      <div className="container mx-auto mt-6 grid gap-8 px-4 lg:grid-cols-[1fr_360px] lg:items-start">
        <article className="flex flex-col gap-5 border-[3px] border-foreground bg-card p-6 shadow-[8px_8px_0_#111]">
          <span className="font-mono text-muted-foreground text-xs uppercase tracking-[0.1em]">
            {category} · {post.body.readingTime} min ·{" "}
            {new Date(post.date).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <h1 className="font-display text-3xl leading-tight tracking-tight md:text-4xl">
            {post._title}
          </h1>
          <div className="whitespace-pre-wrap text-base leading-relaxed">
            {post.body.plainText}
          </div>
        </article>

        <aside className="flex flex-col gap-4">
          {post.sources && post.sources.length > 0 && (
            <div className="flex flex-col gap-2 border-[3px] border-foreground bg-card p-4">
              <span className="font-mono text-muted-foreground text-xs uppercase tracking-[0.1em]">
                Sources · {post.sources.length}
              </span>
              <p className="text-sm leading-relaxed">
                Every claim links the page it came from. This block is
                generated from the run's knowledge base, not written by hand.
              </p>
              <ul className="flex flex-col gap-1.5">
                {post.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      className="text-secondary text-sm hover:underline"
                      href={source.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {post.runProvenance && (
            <div className="flex flex-col gap-1.5 border-[3px] border-foreground bg-foreground p-4 text-background">
              <span className="font-mono text-background/70 text-xs uppercase tracking-[0.1em]">
                Published by Quillrun
              </span>
              <p className="text-sm leading-relaxed">
                Run #{post.runProvenance.runId} · {post.runProvenance.sourceCount} sources
                · {post.runProvenance.gatesPassed} gates passed
                {post.runProvenance.humanApproved ? " · approved by a human" : ""}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2.5 border-[3px] border-foreground bg-primary p-4">
            <span className="font-display text-base">Want this on your site?</span>
            <Button asChild variant="outline">
              <Link href={`${env.NEXT_PUBLIC_APP_URL}/sign-up`}>Start free</Link>
            </Button>
          </div>

          <div className="flex flex-col gap-1.5 border-border border-t pt-3">
            <span className="font-mono text-muted-foreground text-xs uppercase tracking-[0.1em]">
              Related
            </span>
            <Link
              className="font-semibold text-sm hover:text-secondary"
              href={localeHref(locale, "/product/mcp")}
            >
              MCP server →
            </Link>
            <Link className="font-semibold text-sm hover:text-secondary" href={localeHref(locale, "/blog")}>
              All posts →
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
};

export default BlogPost;
