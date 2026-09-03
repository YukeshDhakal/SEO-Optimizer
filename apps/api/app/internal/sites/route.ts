import { database } from "@repo/database";
import {
  badRequest,
  isAuthorized,
  loadOrganization,
  notFound,
  parseLimit,
  serverError,
  unauthorized,
} from "../_lib/internal-auth";

interface SiteRow {
  base_url: string | null;
  cms_type: string;
  consecutive_publish_failures: number;
  created_at: string;
  display_name: string;
  id: string;
  paused: boolean;
  status: string;
}

// MCP tool: `list_sites`. `organizationId` arrives as a query param rather
// than being derived from a session — there is no session behind an MCP tool
// call. See `_lib/internal-auth.ts` for the full note on that trade-off.
export const GET = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId")?.trim() ?? "";

  if (!organizationId) {
    return badRequest("organizationId is required.");
  }

  const organization = await loadOrganization(organizationId);
  if (!organization) {
    return notFound("Organization not found.");
  }

  const { data, error } = await database
    .from("site_connections")
    .select(
      "id, display_name, cms_type, base_url, status, paused, consecutive_publish_failures, created_at"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(parseLimit(url.searchParams.get("limit")))
    .returns<SiteRow[]>();

  if (error) {
    return serverError(error.message);
  }

  const sites = data ?? [];

  return Response.json({
    organizationId,
    count: sites.length,
    sites: sites.map((site) => ({
      id: site.id,
      displayName: site.display_name,
      cmsType: site.cms_type,
      baseUrl: site.base_url,
      status: site.status,
      paused: site.paused,
      consecutivePublishFailures: site.consecutive_publish_failures,
      createdAt: site.created_at,
    })),
  });
};
