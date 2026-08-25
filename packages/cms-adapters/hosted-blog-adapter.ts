import { keys } from "./keys";
import type {
  CmsAdapter,
  CmsConnectionConfig,
  PublishPostInput,
  PublishPostResult,
  TestConnectionResult,
} from "./types";

export const hostedBlogPostUrl = (
  organizationSlug: string,
  slug: string
): string => {
  const { NEXT_PUBLIC_ROOT_DOMAIN } = keys();
  return `https://${organizationSlug}.${NEXT_PUBLIC_ROOT_DOMAIN}/blog/${slug}`;
};

// No external dependency at all — "publishing" is just computing the URL
// this post will render at (apps/web's tenant-blog route reads directly
// from the `posts` table). Always "connected"; there's nothing to test.
export const hostedBlogAdapter: CmsAdapter = {
  id: "hosted_blog",

  testConnection(_config: CmsConnectionConfig): Promise<TestConnectionResult> {
    return Promise.resolve({ ok: true });
  },

  publishPost(
    config: CmsConnectionConfig,
    input: PublishPostInput
  ): Promise<PublishPostResult> {
    return Promise.resolve({
      externalPostId: input.slug,
      publishedUrl: hostedBlogPostUrl(config.organizationSlug, input.slug),
    });
  },
};
