import {
  checkKillSwitch,
  checkQuota,
  checkRateLimit,
  contentPipelineWorkflow,
  writeAuditLog,
} from "@repo/workflows";
import { start } from "workflow/api";
import {
  badRequest,
  isAuthorized,
  loadOrganization,
  loadSiteForOrg,
  notFound,
  readJsonBody,
  resolveActingUser,
  resolveAuditActorId,
  resolveAuditSource,
  serverError,
  stringField,
  unauthorized,
} from "../_lib/internal-auth";

// The plan specifies `triggerType: "external_api"`. It cannot be that value
// yet: `pipeline_runs.trigger_type` carries
// `check (trigger_type in ('manual','scheduled'))` (phase3 migration), and
// `CreateRunInput["triggerType"]` is typed to match it — so 'external_api'
// would fail `createPipelineRun`'s insert and kill the run before any row
// exists to report on. Widening it is a migration, which this phase
// deliberately does not write. 'manual' is the honest of the two legal values
// (this is an on-demand request, not a schedule firing), and the MCP origin is
// not lost: the audit-log entries below carry `metadata.source: "n8n_mcp"`
// (audit_log.actor is itself `uuid`, so the literal marker can't live there —
// see the writeAuditLog calls below), which is what actually distinguishes an
// external AI agent's run from a human's. Flip this one constant once the
// check constraint is extended.
const TRIGGER_TYPE = "manual" as const;

interface GateFailure {
  action: string;
  reason: string;
  status: number;
}

// The gate sequence, in one place and in the one order that matters: kill
// switch, then rate limit, then quota — exactly what
// `app/cron/dispatch-runs/route.ts` and `apps/app/app/actions/pipeline/
// generate.ts` run before `start()`. Returns the first failure, or null when
// every gate passes.
const firstBlockingGate = async (
  organizationId: string,
  siteConnectionId: string,
  organizationStatus: string
): Promise<GateFailure | null> => {
  // 1/3 — kill switch (platform EMERGENCY_STOP, tenant pause, site pause).
  const killSwitch = await checkKillSwitch(organizationId, siteConnectionId);
  if (killSwitch.blocked) {
    return {
      action: "run.blocked.kill_switch",
      reason: killSwitch.reason ?? "Content generation is currently paused.",
      status: 409,
    };
  }

  // 2/3 — per-tenant posts-per-day / posts-per-week caps.
  const rateLimit = await checkRateLimit(organizationId);
  if (rateLimit.blocked) {
    return {
      action: "run.blocked.rate_limit",
      reason: rateLimit.reason ?? "Blocked by rate limit.",
      status: 429,
    };
  }

  // 3/3 — monthly plan quota.
  const quota = await checkQuota(organizationId);
  if (quota.blocked) {
    return {
      action: "run.blocked.quota",
      reason: quota.reason ?? "Blocked by quota.",
      status: 429,
    };
  }

  // Not in the plan's three-gate list, and deliberately checked *after* them
  // so that sequence stays exactly as specified. Added because a run triggered
  // by an external AI agent is autonomous in the sense `dispatch-runs` means
  // it — nobody is sitting in the dashboard clicking "Generate" — and that
  // route already refuses to spend AI budget for an org whose billing has
  // lapsed. Letting MCP through would have been a way around a control that
  // exists for a real reason.
  if (organizationStatus === "past_due" || organizationStatus === "suspended") {
    return {
      action: "run.blocked.billing",
      reason: `This organization's billing status is "${organizationStatus}".`,
      status: 402,
    };
  }

  return null;
};

// MCP tool: `generate_content`.
//
// The guardrail sequence below is the whole reason this route exists as a
// thin wrapper rather than n8n calling the workflow runtime directly: kill
// switch, then rate limit, then quota — the exact order and the exact
// functions `app/cron/dispatch-runs/route.ts` and
// `apps/app/app/actions/pipeline/generate.ts` already run before `start()`.
// An external AI agent is precisely the caller these guardrails were built to
// catch, since it can and will ask for content in a loop. The workflow's own
// `"use step"`-wrapped copies of these checks would catch a breach too, but
// only after a run row, a billing event and a log line already exist; failing
// here means the costed work is never dispatched at all.
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
  const topicHint = stringField(body, "topicHint");
  const contentType =
    stringField(body, "contentType") === "faq" ? "faq" : "blog";
  const requestedCreatedBy = stringField(body, "createdBy");

  if (!(organizationId && siteConnectionId && topicHint)) {
    return badRequest(
      "organizationId, siteConnectionId and topicHint are required."
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

  // `pipeline_runs.created_by` is `uuid not null references auth.users(id)`,
  // so the literal string "n8n_mcp" the plan names cannot go in that column.
  // The run is attributed to a real member of the org (the owner by default —
  // "on whose behalf"), and `actor: "n8n_mcp"` on the audit entries below
  // records what actually triggered it. See `resolveActingUser`.
  const createdBy = await resolveActingUser(organizationId, requestedCreatedBy);
  if (!createdBy) {
    return badRequest(
      requestedCreatedBy
        ? "createdBy is not a member of this organization."
        : "This organization has no owner or admin to attribute the run to."
    );
  }

  const gate = await firstBlockingGate(
    organizationId,
    siteConnectionId,
    organization.status
  );
  if (gate) {
    await writeAuditLog({
      organizationId,
      actor: resolveAuditActorId(request),
      action: gate.action,
      entityType: "site_connection",
      entityId: siteConnectionId,
      metadata: {
        source: resolveAuditSource(request),
        reason: gate.reason,
        topicHint,
        contentType,
      },
    });
    return Response.json(
      { status: "blocked", reason: gate.reason },
      { status: gate.status }
    );
  }

  try {
    await start(contentPipelineWorkflow, [
      {
        organizationId,
        siteConnectionId,
        createdBy,
        topicHint,
        triggerType: TRIGGER_TYPE,
        contentType,
      },
    ]);
  } catch (startError) {
    const message =
      startError instanceof Error ? startError.message : String(startError);
    return serverError(`Couldn't start the pipeline run: ${message}`);
  }

  await writeAuditLog({
    organizationId,
    actor: resolveAuditActorId(request),
    action: "run.started",
    entityType: "site_connection",
    entityId: siteConnectionId,
    metadata: {
      source: resolveAuditSource(request),
      topicHint,
      contentType,
      createdBy,
      triggerType: TRIGGER_TYPE,
    },
  });

  // Returns as soon as the run is dispatched rather than awaiting
  // `run.returnValue`, matching `dispatch-runs` (the route template for this
  // file) rather than the dashboard's server action. The full pipeline is
  // several minutes of model calls; blocking an HTTP request handler on that
  // risks a function timeout, and the run is durable and independent of this
  // request either way. `start()` also only hands back the *workflow* run id,
  // which nothing persists onto `pipeline_runs` — so there is no pipeline run
  // id to return here even in principle. The client polls `/internal/runs`
  // for this site to find it, which is what `get_run_status` is for.
  return Response.json(
    {
      status: "started",
      organizationId,
      siteConnectionId,
      topicHint,
      contentType,
      pollUrl: `/internal/runs?organizationId=${organizationId}&siteConnectionId=${siteConnectionId}`,
    },
    { status: 202 }
  );
};
