import { database } from "@repo/database";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

// Reached via a subdomain rewrite in proxy.ts:
// https://{orgSlug}.{ROOT_DOMAIN}/blog/{postSlug} -> /tenant-blog/{orgSlug}/{postSlug}.
// Public, unauthenticated content, so this deliberately reads through the
// service-role `database` client (not the session-scoped RLS client) —
// there is no visitor session to scope to, and this data is meant to be
// public by definition (it's a published blog post).
export const revalidate = 60;

interface TenantBlogPostPageProperties {
  readonly params: Promise<{ orgSlug: string; postSlug: string }>;
}

const getPublishedPost = async (orgSlug: string, postSlug: string) => {
  const { data: organization } = await database
    .from("organizations")
    .select("id, name")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (!organization) {
    return null;
  }

  // Scoped to hosted_blog connections specifically - a post published to a
  // customer's own WordPress site has no business rendering on our domain.
  const { data: posts } = await database
    .from("posts")
    .select("*, site_connections!inner(cms_type)")
    .eq("organization_id", organization.id)
    .eq("slug", postSlug)
    .eq("status", "published")
    .eq("site_connections.cms_type", "hosted_blog")
    .limit(1);

  const post = posts?.[0];
  if (!post) {
    return null;
  }

  return { organization, post };
};

export const generateMetadata = async ({
  params,
}: TenantBlogPostPageProperties): Promise<Metadata> => {
  const { orgSlug, postSlug } = await params;
  const result = await getPublishedPost(orgSlug, postSlug);

  if (!result) {
    return {};
  }

  const { organization, post } = result;

  return {
    title: post.meta_title ?? post.title,
    description: post.meta_description ?? undefined,
    openGraph: {
      title: post.meta_title ?? post.title,
      description: post.meta_description ?? undefined,
      type: "article",
      siteName: organization.name,
    },
  };
};

const TenantBlogPostPage = async ({
  params,
}: TenantBlogPostPageProperties) => {
  const { orgSlug, postSlug } = await params;
  const result = await getPublishedPost(orgSlug, postSlug);

  if (!result) {
    notFound();
  }

  const { post } = result;

  return (
    <div className="container mx-auto max-w-prose py-16">
      <article className="prose prose-neutral dark:prose-invert">
        <h1>{post.title}</h1>
        {/** biome-ignore lint/security/noDangerouslySetInnerHtml: content is authored by the tenant's own org-admin via the dashboard's "Publish now" form, not by anonymous visitors - same trust model as a CMS accepting HTML from its own signed-in editors. */}
        <div dangerouslySetInnerHTML={{ __html: post.content_html }} />
      </article>
    </div>
  );
};

export default TenantBlogPostPage;
