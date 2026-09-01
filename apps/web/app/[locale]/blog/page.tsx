import { blog } from "@repo/cms";
import { Image } from "@repo/cms/components/image";
import { cn } from "@repo/design-system/lib/utils";
import { getDictionary } from "@repo/internationalization";
import type { Blog, WithContext } from "@repo/seo/json-ld";
import { JsonLd } from "@repo/seo/json-ld";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";

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
          {posts.length === 0 ? (
            <p className="font-medium text-muted-foreground">
              No posts yet — check back soon.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {posts.map((post, index) => (
                <Link
                  className={cn(
                    "flex cursor-pointer flex-col gap-4 border-[3px] border-foreground bg-card shadow-[8px_8px_0_#111] transition-transform hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[12px_12px_0_#111]",
                    !index && "md:col-span-2"
                  )}
                  href={`/blog/${post._slug}`}
                  key={post._slug}
                >
                  <Image
                    alt={post.image.alt ?? ""}
                    className="border-b-[3px] border-foreground"
                    height={post.image.height}
                    src={post.image.url}
                    width={post.image.width}
                  />
                  <div className="flex flex-col gap-2 px-6 pb-6">
                    <p className="font-bold text-muted-foreground text-sm">
                      {new Date(post.date).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    <h2 className="font-display max-w-3xl text-2xl leading-tight tracking-tight">
                      {post._title}
                    </h2>
                    <p className="max-w-3xl text-base text-muted-foreground">
                      {post.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default BlogIndex;
