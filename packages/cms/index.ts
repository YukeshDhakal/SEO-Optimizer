// No longer BaseHub-typed-query-driven. The BASEHUB_TOKEN this repo was
// given twice pointed at a repo with no matching content schema (no
// PostsItem/LegalPagesItem type at all - see PRD.md §2) - `fragmentOn`
// referencing those type names failed to compile against the live schema
// fetched at Vercel build time, breaking every consumer regardless of how
// defensively they read the results. Legal content moved to
// apps/web/lib/legal-content.ts (static, real copy). Blog stays wired to
// this same shape so a future real content backend is a drop-in swap -
// it just returns empty/null unconditionally for now.

export interface CmsImage {
  url: string;
  width: number;
  height: number;
  alt: string | null;
  blurDataURL: string | null;
}

export interface PostMeta {
  _slug: string;
  _title: string;
  authors: { _title: string; avatar: CmsImage; xUrl: string | null }[];
  categories: { _title: string }[];
  date: string;
  description: string;
  image: CmsImage;
}

export interface Post extends PostMeta {
  body: {
    plainText: string;
    json: { content: unknown; toc: unknown };
    readingTime: number;
  };
}

export const blog = {
  getPosts: (): Promise<PostMeta[]> => Promise.resolve([]),
  getLatestPost: (): Promise<Post | null> => Promise.resolve(null),
  getPost: (_slug: string): Promise<Post | null> => Promise.resolve(null),
};
