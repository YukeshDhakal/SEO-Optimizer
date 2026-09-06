import { blog } from "@repo/cms";
import { getDictionary } from "@repo/internationalization";
import type { Blog, WithContext } from "@repo/seo/json-ld";
import { JsonLd } from "@repo/seo/json-ld";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { BlogGrid } from "./blog-grid";

interface BlogProps {
  params: Promise<{
    locale: string;
  }>;
}

export const generateMetadata = async ({
  params,
}: BlogProps): Promise<Metadata> => {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return createMetadata(dictionary.web.blog.meta);
};

const BlogIndex = async ({ params }: BlogProps) => {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  const posts = await blog.getPosts();

  const jsonLd: WithContext<Blog> = {
    "@type": "Blog",
    "@context": "https://schema.org",
  };

  return (
    <>
      <JsonLd code={jsonLd} />
      <div className="w-full border-b-[3px] border-foreground py-16 lg:py-20">
        <div className="container mx-auto flex flex-col gap-10 px-4">
          <div className="flex items-baseline gap-4">
            <h1 className="font-display text-5xl tracking-tight md:text-7xl">
              WRITING
            </h1>
            <span className="border-[3px] border-foreground bg-secondary px-3.5 py-1.5 font-bold text-secondary-foreground text-sm">
              Field notes from the pipeline
            </span>
          </div>
          <BlogGrid locale={locale} posts={posts} />
        </div>
      </div>
    </>
  );
};

export default BlogIndex;
