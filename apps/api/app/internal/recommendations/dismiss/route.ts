import { database } from "@repo/database";
import { writeAuditLog } from "@repo/workflows";
import {
  badRequest,
  isAuthorized,
  notFound,
  readJsonBody,
  resolveAuditActorId,
  resolveAuditSource,
  serverError,
  stringField,
  unauthorized,
} from "../../_lib/internal-auth";

// MCP tool: `dismiss_recommendation`.
//
// The update payload mirrors `apps/app/app/actions/recommendations/mutate.ts`'s
// `dismissRecommendation` exactly — `status: "dismissed"` plus `dismissed_at`,
// and nothing else. That matters beyond tidiness: Phase A's
// generate-content-recommendations cron upserts only the *computed* columns,
// so a dismissal set here survives every regeneration and the row disappears
// on its own once the underlying condition actually resolves. Deleting the row
// instead would just have it resurrected on the next cron pass.
//
// The one thing this does that the server action doesn't need to: scope the
// update by organization_id. The dashboard action runs under a session-scoped
// RLS client that enforces that for it; this runs under the service-role
// client, which bypasses RLS entirely.
export const POST = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const body = await readJsonBody(request);
  if (!body) {
    return badRequest("A JSON object body is required.");
  }

  const id = stringField(body, "id");
  const organizationId = stringField(body, "organizationId");

  if (!(id && organizationId)) {
    return badRequest("id and organizationId are required.");
  }

  const { data, error } = await database
    .from("content_recommendations")
    .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select("id, site_connection_id, recommendation_type, subject_key")
    .maybeSingle();

  if (error) {
    return serverError(error.message);
  }
  if (!data) {
    return notFound("Recommendation not found for this organization.");
  }

  await writeAuditLog({
    organizationId,
    actor: resolveAuditActorId(request),
    action: "recommendation.dismissed",
    entityType: "content_recommendation",
    entityId: data.id,
    metadata: {
      source: resolveAuditSource(request),
      siteConnectionId: data.site_connection_id,
      recommendationType: data.recommendation_type,
      subjectKey: data.subject_key,
    },
  });

  return Response.json({
    id: data.id,
    status: "dismissed",
    siteConnectionId: data.site_connection_id,
  });
};
