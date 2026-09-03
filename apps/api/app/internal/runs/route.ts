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

interface RunRow {
  current_step: string | null;
  error: string | null;
  finished_at: string | null;
  id: string;
  input: Json;
  post_id: string | null;
  schedule_id: string | null;
  site_connection_id: string;
  started_at: string;
  status: string;
  trigger_type: string;
}

interface StepRow {
  error: string | null;
  finished_at: string | null;
  id: string;
  output: Json | null;
  started_at: string;
  status: string;
  step_name: string;
}

const serializeRun = (run: RunRow) => ({
  id: run.id,
  siteConnectionId: run.site_connection_id,
  postId: run.post_id,
  scheduleId: run.schedule_id,
  triggerType: run.trigger_type,
  status: run.status,
  currentStep: run.current_step,
  error: run.error,
  input: run.input,
  startedAt: run.started_at,
  finishedAt: run.finished_at,
});

const RUN_COLUMNS =
  "id, site_connection_id, post_id, schedule_id, trigger_type, status, current_step, error, input, started_at, finished_at";

// One run plus its `pipeline_run_steps` timeline. Extracted rather than
// inlined in the handler purely to keep each half readable on its own.
const runDetail = async (
  runId: string,
  organizationId: string
): Promise<Response> => {
  const { data: run, error } = await database
    .from("pipeline_runs")
    .select(RUN_COLUMNS)
    .eq("id", runId)
    .eq("organization_id", organizationId)
    .maybeSingle<RunRow>();

  if (error) {
    return serverError(error.message);
  }
  if (!run) {
    return notFound("Run not found for this organization.");
  }

  // Only fetched once the parent run is confirmed to belong to this org —
  // `pipeline_run_steps` has no organization_id of its own, so querying it by
  // run id first would be an unscoped read.
  const { data: stepRows, error: stepsError } = await database
    .from("pipeline_run_steps")
    .select("id, step_name, status, output, error, started_at, finished_at")
    .eq("pipeline_run_id", runId)
    .order("started_at", { ascending: true })
    .returns<StepRow[]>();

  if (stepsError) {
    return serverError(stepsError.message);
  }

  return Response.json({
    organizationId,
    run: serializeRun(run),
    steps: (stepRows ?? []).map((step) => ({
      id: step.id,
      stepName: step.step_name,
      status: step.status,
      output: step.output,
      error: step.error,
      startedAt: step.started_at,
      finishedAt: step.finished_at,
    })),
  });
};

// MCP tool: `get_run_status`.
//
// Two modes, both org-scoped:
//   ?runId=…            → that one run plus its `pipeline_run_steps` timeline
//   ?siteConnectionId=… → the most recent runs for that site (or the whole org
//                         if omitted)
//
// The listing mode is not decoration. `/internal/generate` returns as soon as
// the workflow is dispatched and has no pipeline run id to hand back (see the
// note in that route), so listing recent runs for the site is how a client
// finds the run it just triggered.
export const GET = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId")?.trim() ?? "";
  const runId = url.searchParams.get("runId")?.trim() ?? "";
  const siteConnectionId =
    url.searchParams.get("siteConnectionId")?.trim() ?? "";

  if (!organizationId) {
    return badRequest("organizationId is required.");
  }

  const organization = await loadOrganization(organizationId);
  if (!organization) {
    return notFound("Organization not found.");
  }

  if (runId) {
    return await runDetail(runId, organizationId);
  }

  if (siteConnectionId) {
    const site = await loadSiteForOrg(siteConnectionId, organizationId);
    if (!site) {
      return notFound("Site not found for this organization.");
    }
  }

  let query = database
    .from("pipeline_runs")
    .select(RUN_COLUMNS)
    .eq("organization_id", organizationId);

  if (siteConnectionId) {
    query = query.eq("site_connection_id", siteConnectionId);
  }

  const { data, error } = await query
    .order("started_at", { ascending: false })
    .limit(parseLimit(url.searchParams.get("limit")))
    .returns<RunRow[]>();

  if (error) {
    return serverError(error.message);
  }

  const runs = data ?? [];

  return Response.json({
    organizationId,
    siteConnectionId: siteConnectionId || null,
    count: runs.length,
    runs: runs.map(serializeRun),
  });
};
