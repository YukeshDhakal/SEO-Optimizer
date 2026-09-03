import { database } from "@repo/database";
import {
  badRequest,
  isAuthorized,
  loadOrganization,
  loadSiteForOrg,
  notFound,
  parseLimit,
  serverError,
  unauthorized,
} from "../_lib/internal-auth";

interface PostRow {
  created_at: string;
  external_post_id: string | null;
  id: string;
  meta_description: string | null;
  meta_title: string | null;
  published_at: string | null;
  published_url: string | null;
  site_connection_id: string;
  slug: string;
  status: string;
  title: string;
}

// MCP tool: `list_posts`. Deliberately never selects content_html /
// content_markdown / content_embedding: the caller is an LLM with a finite
// context window, and a list of 50 full articles is both useless to it and an
// enormous response payload. A single post's body belongs behind its own
// fetch-one call if that's ever needed.
export const GET = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId")?.trim() ?? "";
  const siteConnectionId =
    url.searchParams.get("siteConnectionId")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";

  if (!organizationId) {
    return badRequest("organizationId is required.");
  }

  const organization = await loadOrganization(organizationId);
  if (!organization) {
    return notFound("Organization not found.");
  }

  // Verified rather than just appended as a filter: a site id belonging to
  // another tenant should be an explicit 404, not a silently-empty list that
  // an LLM will read as "this site has no posts".
  if (siteConnectionId) {
    const site = await loadSiteForOrg(siteConnectionId, organizationId);
    if (!site) {
      return notFound("Site not found for this organization.");
    }
  }

  let query = database
    .from("posts")
    .select(
      "id, site_connection_id, title, slug, status, meta_title, meta_description, external_post_id, published_url, published_at, created_at"
    )
    .eq("organization_id", organizationId);

  if (siteConnectionId) {
    query = query.eq("site_connection_id", siteConnectionId);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(parseLimit(url.searchParams.get("limit")))
    .returns<PostRow[]>();

  if (error) {
    return serverError(error.message);
  }

  const posts = data ?? [];

  return Response.json({
    organizationId,
    siteConnectionId: siteConnectionId || null,
    status: status || null,
    count: posts.length,
    posts: posts.map((post) => ({
      id: post.id,
      siteConnectionId: post.site_connection_id,
      title: post.title,
      slug: post.slug,
      status: post.status,
      metaTitle: post.meta_title,
      metaDescription: post.meta_description,
      externalPostId: post.external_post_id,
      publishedUrl: post.published_url,
      publishedAt: post.published_at,
      createdAt: post.created_at,
    })),
  });
};
