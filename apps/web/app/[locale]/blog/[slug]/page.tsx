import { blog } from "@repo/cms";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

interface BlogPostProperties {
  readonly params: Promise<{
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
// No real posts exist, so every slug 404s until a real content backend is
// connected; kept as a thin passthrough rather than the full BaseHub
// rich-text renderer so there's nothing here to break on the next schema
// swap. Deliberately no generateStaticParams - see legal/[slug]/page.tsx
// for why mixing SSG into this otherwise fully-dynamic [locale] tree
// threw a real production DYNAMIC_SERVER_USAGE error.
const BlogPost = async ({ params }: BlogPostProperties) => {
  const { slug } = await params;
  const page = await blog.getPost(slug);

  if (!page) {
    notFound();
  }
};

export default BlogPost;
