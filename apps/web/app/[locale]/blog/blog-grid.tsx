"use client";

import { cn } from "@repo/design-system/lib/utils";
import type { PostMeta } from "@repo/cms";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { localeHref } from "@/lib/locale-href";

interface BlogGridProperties {
  readonly posts: PostMeta[];
  readonly locale: string;
}

// Category pills are real filters over whatever categories actually appear
// on returned posts - "All" is the only pill guaranteed to do something
// today, since blog.getPosts() returns nothing until a real content backend
// exists (see packages/cms/index.ts). Nothing here fabricates categories
// that aren't on a real post.
export const BlogGrid = ({ posts, locale }: BlogGridProperties) => {
  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const post of posts) {
      for (const category of post.categories) {
        seen.add(category._title);
      }
    }
    return Array.from(seen);
  }, [posts]);

  const [active, setActive] = useState<string | null>(null);

  const featured = posts.find((post) => post.featured) ?? posts[0];
  const rest = posts.filter((post) => post !== featured);
  const filteredRest = active
    ? rest.filter((post) => post.categories.some((c) => c._title === active))
    : rest;

  return (
    <div className="flex flex-col gap-6">
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            className={cn(
              "border-[3px] border-foreground px-2.5 py-1 font-bold text-xs",
              active === null ? "bg-primary" : "bg-card"
            )}
            onClick={() => setActive(null)}
            type="button"
          >
            All
          </button>
          {categories.map((category) => (
            <button
              className={cn(
                "border-[3px] border-foreground px-2.5 py-1 font-bold text-xs",
                active === category ? "bg-primary" : "bg-card"
              )}
              key={category}
              onClick={() => setActive(category)}
              type="button"
            >
              {category}
            </button>
          ))}
        </div>
      )}

      {featured && (
        <Link
          className="flex flex-col gap-2 border-[3px] border-foreground bg-brand-yellow p-5 shadow-[6px_6px_0_#111] transition-transform hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[10px_10px_0_#111]"
          href={localeHref(locale, `/blog/${featured._slug}`)}
        >
          <span className="flex items-center gap-2">
            <span className="border-2 border-foreground bg-card px-1.5 py-0.5 font-bold text-[10px]">
              FEATURED
            </span>
            <span className="font-mono text-muted-foreground text-xs">
              {featured.categories[0]?._title ?? "Writing"}
            </span>
          </span>
          <span className="font-display text-2xl leading-tight tracking-tight">
            {featured._title}
          </span>
          <span className="text-sm">{featured.description}</span>
        </Link>
      )}

      {filteredRest.length === 0 ? (
        <p className="font-medium text-muted-foreground">
          {posts.length === 0
            ? "No posts yet — check back soon."
            : "Nothing in this category yet."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {filteredRest.map((post) => (
            <Link
              className="flex cursor-pointer flex-col gap-4 border-[3px] border-foreground bg-card shadow-[8px_8px_0_#111] transition-transform hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[12px_12px_0_#111]"
              href={localeHref(locale, `/blog/${post._slug}`)}
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
  );
};
