import { database, type Json } from "@repo/database";
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

interface RecommendationRow {
  actioned_at: string | null;
  created_at: string;
  description: string;
  dismissed_at: string | null;
  id: string;
  metrics: Json;
  post_id: string | null;
  priority: string;
  recommendation_type: string;
  site_connection_id: string;
  status: string;
  subject_key: string;
  title: string;
  updated_at: string;
}

// MCP tool: `get_recommendations`. Reads Phase A's `content_recommendations`
// table. Ordering mirrors the dashboard's own recommendations page exactly
// (status asc, priority desc, created_at desc) so an MCP client and a human
// looking at the same site see the same list in the same order.
export const GET = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId")?.trim() ?? "";
  const siteConnectionId =
    url.searchParams.get("siteConnectionId")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";
  const recommendationType =
    url.searchParams.get("recommendationType")?.trim() ?? "";

  if (!organizationId) {
    return badRequest("organizationId is required.");
  }

  const organization = await loadOrganization(organizationId);
  if (!organization) {
    return notFound("Organization not found.");
  }

  if (siteConnectionId) {
    const site = await loadSiteForOrg(siteConnectionId, organizationId);
    if (!site) {
      return notFound("Site not found for this organization.");
    }
  }

  let query = database
    .from("content_recommendations")
    .select(
      "id, site_connection_id, post_id, recommendation_type, subject_key, title, description, priority, metrics, status, dismissed_at, actioned_at, created_at, updated_at"
    )
    .eq("organization_id", organizationId);

  if (siteConnectionId) {
    query = query.eq("site_connection_id", siteConnectionId);
  }
  if (status) {
    query = query.eq("status", status);
  }
  if (recommendationType) {
    query = query.eq("recommendation_type", recommendationType);
  }

  const { data, error } = await query
    .order("status", { ascending: true })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(parseLimit(url.searchParams.get("limit")))
    .returns<RecommendationRow[]>();

  if (error) {
    return serverError(error.message);
  }

  const recommendations = data ?? [];

  return Response.json({
    organizationId,
    siteConnectionId: siteConnectionId || null,
    count: recommendations.length,
    recommendations: recommendations.map((row) => ({
      id: row.id,
      siteConnectionId: row.site_connection_id,
      postId: row.post_id,
      recommendationType: row.recommendation_type,
      subjectKey: row.subject_key,
      title: row.title,
      description: row.description,
      priority: row.priority,
      metrics: row.metrics,
      status: row.status,
      dismissedAt: row.dismissed_at,
      actionedAt: row.actioned_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
};
