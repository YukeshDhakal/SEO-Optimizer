import { database } from "@repo/database";
import {
  computeNextRunAt,
  validateCadence,
  writeAuditLog,
} from "@repo/workflows";
import {
  badRequest,
  isAuthorized,
  loadOrganization,
  loadSiteForOrg,
  notFound,
  parseLimit,
  readJsonBody,
  resolveActingUser,
  resolveAuditActorId,
  resolveAuditSource,
  serverError,
  stringField,
  unauthorized,
} from "../_lib/internal-auth";

interface ScheduleRow {
  cadence: string;
  created_at: string;
  created_by: string;
  enabled: boolean;
  id: string;
  next_run_at: string | null;
  organization_id: string;
  site_connection_id: string;
  timezone: string;
  topic_hint: string;
  topic_source: string;
}

const SCHEDULE_COLUMNS =
  "id, organization_id, site_connection_id, cadence, timezone, enabled, next_run_at, topic_hint, topic_source, created_by, created_at";

const serialize = (row: ScheduleRow) => ({
  id: row.id,
  organizationId: row.organization_id,
  siteConnectionId: row.site_connection_id,
  cadence: row.cadence,
  timezone: row.timezone,
  enabled: row.enabled,
  nextRunAt: row.next_run_at,
  topicHint: row.topic_hint,
  topicSource: row.topic_source,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

// Every write below is scoped by organization_id as well as id: the
// service-role client bypasses the schedules_insert/update/delete RLS policies
// that do this for the dashboard's own mutations.
const loadScheduleForOrg = async (
  id: string,
  organizationId: string
): Promise<ScheduleRow | null> => {
  const { data } = await database
    .from("schedules")
    .select(SCHEDULE_COLUMNS)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle<ScheduleRow>();
  return data ?? null;
};

// MCP tool: `manage_schedule`. One route, four methods, each mirroring the
// matching server action in `apps/app/app/actions/schedules/mutate.ts`.

// GET — list an org's schedules, optionally filtered to one site.
export const GET = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId")?.trim() ?? "";
  const siteConnectionId =
    url.searchParams.get("siteConnectionId")?.trim() ?? "";

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
    .from("schedules")
    .select(SCHEDULE_COLUMNS)
    .eq("organization_id", organizationId);

  if (siteConnectionId) {
    query = query.eq("site_connection_id", siteConnectionId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(parseLimit(url.searchParams.get("limit")))
    .returns<ScheduleRow[]>();

  if (error) {
    return serverError(error.message);
  }

  const schedules = data ?? [];

  return Response.json({
    organizationId,
    siteConnectionId: siteConnectionId || null,
    count: schedules.length,
    schedules: schedules.map(serialize),
  });
};

// POST — create, mirroring `createSchedule`: validate the cron expression
// against the timezone first, compute `next_run_at` from it, then insert with
// the same column set.
export const POST = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const body = await readJsonBody(request);
  if (!body) {
    return badRequest("A JSON object body is required.");
  }

  const organizationId = stringField(body, "organizationId");
  const siteConnectionId = stringField(body, "siteConnectionId");
  const cadence = stringField(body, "cadence");
  const timezone = stringField(body, "timezone") || "UTC";
  const topicHint = stringField(body, "topicHint");
  const topicSource =
    stringField(body, "topicSource") === "auto" ? "auto" : "manual";
  const requestedCreatedBy = stringField(body, "createdBy");

  if (!(organizationId && siteConnectionId && cadence && topicHint)) {
    return badRequest(
      "organizationId, siteConnectionId, cadence and topicHint are required."
    );
  }

  const organization = await loadOrganization(organizationId);
  if (!organization) {
    return notFound("Organization not found.");
  }

  const site = await loadSiteForOrg(siteConnectionId, organizationId);
  if (!site) {
    return notFound("Site not found for this organization.");
  }

  let nextRunAt: string;
  try {
    validateCadence(cadence, timezone);
    nextRunAt = computeNextRunAt(cadence, timezone).toISOString();
  } catch {
    return badRequest("That doesn't look like a valid cron expression.");
  }

  // `schedules.created_by` is `uuid not null references auth.users(id)`, same
  // as `pipeline_runs.created_by` — see `resolveActingUser` for why the MCP
  // connector can't be the value there and what carries the real attribution.
  const createdBy = await resolveActingUser(organizationId, requestedCreatedBy);
  if (!createdBy) {
    return badRequest(
      requestedCreatedBy
        ? "createdBy is not a member of this organization."
        : "This organization has no owner or admin to attribute the schedule to."
    );
  }

  const { data, error } = await database
    .from("schedules")
    .insert({
      organization_id: organizationId,
      site_connection_id: siteConnectionId,
      cadence,
      timezone,
      topic_hint: topicHint,
      topic_source: topicSource,
      next_run_at: nextRunAt,
      created_by: createdBy,
    })
    .select(SCHEDULE_COLUMNS)
    .single<ScheduleRow>();

  if (error || !data) {
    return serverError(error?.message ?? "Couldn't create the schedule.");
  }

  await writeAuditLog({
    organizationId,
    actor: resolveAuditActorId(request),
    action: "schedule.created",
    entityType: "schedule",
    entityId: data.id,
    metadata: {
      source: resolveAuditSource(request),
      siteConnectionId,
      cadence,
      timezone,
      topicHint,
      topicSource,
    },
  });

  return Response.json(
    { status: "created", schedule: serialize(data) },
    { status: 201 }
  );
};

// PATCH — enable/disable, mirroring `toggleScheduleEnabled`.
//
// That action receives the *current* value from a hidden form field and writes
// its negation, which is fine for a rendered form but a race for an API caller
// who may not know the current value. So `enabled` here is the desired value
// when supplied; omit it and the behaviour falls back to the action's exact
// read-then-flip.
export const PATCH = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const body = await readJsonBody(request);
  if (!body) {
    return badRequest("A JSON object body is required.");
  }

  const organizationId = stringField(body, "organizationId");
  const id = stringField(body, "id");
  const desired = body.enabled;

  if (!(organizationId && id)) {
    return badRequest("organizationId and id are required.");
  }
  if (desired !== undefined && typeof desired !== "boolean") {
    return badRequest("enabled must be a boolean when supplied.");
  }

  const existing = await loadScheduleForOrg(id, organizationId);
  if (!existing) {
    return notFound("Schedule not found for this organization.");
  }

  const enabled = typeof desired === "boolean" ? desired : !existing.enabled;

  const { data, error } = await database
    .from("schedules")
    .update({ enabled })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select(SCHEDULE_COLUMNS)
    .single<ScheduleRow>();

  if (error || !data) {
    return serverError(error?.message ?? "Couldn't update the schedule.");
  }

  await writeAuditLog({
    organizationId,
    actor: resolveAuditActorId(request),
    action: enabled ? "schedule.enabled" : "schedule.disabled",
    entityType: "schedule",
    entityId: id,
    metadata: {
      source: resolveAuditSource(request),
      siteConnectionId: data.site_connection_id,
      enabled,
    },
  });

  return Response.json({ status: "updated", schedule: serialize(data) });
};

// DELETE — mirroring `deleteSchedule`. Accepts the id from the query string or
// a JSON body, since DELETE bodies are awkward for some HTTP clients (n8n's
// HTTP Request node included).
export const DELETE = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const body = await readJsonBody(request);

  const organizationId =
    url.searchParams.get("organizationId")?.trim() ||
    (body ? stringField(body, "organizationId") : "");
  const id =
    url.searchParams.get("id")?.trim() || (body ? stringField(body, "id") : "");

  if (!(organizationId && id)) {
    return badRequest("organizationId and id are required.");
  }

  const existing = await loadScheduleForOrg(id, organizationId);
  if (!existing) {
    return notFound("Schedule not found for this organization.");
  }

  const { error } = await database
    .from("schedules")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    return serverError(error.message);
  }

  await writeAuditLog({
    organizationId,
    actor: resolveAuditActorId(request),
    action: "schedule.deleted",
    entityType: "schedule",
    entityId: id,
    metadata: {
      source: resolveAuditSource(request),
      siteConnectionId: existing.site_connection_id,
      cadence: existing.cadence,
      topicHint: existing.topic_hint,
    },
  });

  return Response.json({ status: "deleted", id });
};
