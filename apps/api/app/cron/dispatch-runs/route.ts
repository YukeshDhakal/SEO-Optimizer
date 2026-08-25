import { database } from "@repo/database";
import { computeNextRunAt, contentPipelineWorkflow } from "@repo/workflows";
import { start } from "workflow/api";
import { env } from "@/env";

// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically
// when the project has a `CRON_SECRET` env var set — this route is worth
// gating on it (unlike the pre-existing no-auth `/cron/keep-alive`) because
// it starts real, costed AI-generation workflow runs, not a cheap DB ping.
const isAuthorized = (request: Request): boolean => {
  if (!env.CRON_SECRET) {
    return true; // not configured yet — same graceful-degradation posture as the rest of this app's not-yet-set secrets
  }
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
};

interface DueScheduleRow {
  id: string;
  organization_id: string;
  site_connection_id: string;
  cadence: string;
  timezone: string;
  topic_hint: string;
  created_by: string;
  site_connections: { paused: boolean } | null;
}

// Finds `schedules` that are due, skips anything paused at the tenant or
// site level, starts a durable workflow run for the rest, and advances
// `next_run_at`. Billing/quota gating (usage_counters/subscriptions) is
// Phase 6 — deliberately not checked here yet, see the TODO below.
export const GET = async (request: Request) => {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();

  const { data: dueSchedules, error } = await database
    .from("schedules")
    .select(
      "id, organization_id, site_connection_id, cadence, timezone, topic_hint, created_by, site_connections(paused)"
    )
    .eq("enabled", true)
    .lte("next_run_at", now.toISOString())
    .returns<DueScheduleRow[]>();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ scheduleId: string; action: string }> = [];

  for (const schedule of dueSchedules ?? []) {
    const { data: settings } = await database
      .from("tenant_settings")
      .select("paused")
      .eq("organization_id", schedule.organization_id)
      .maybeSingle();

    const tenantPaused = settings?.paused ?? false;
    const sitePaused = schedule.site_connections?.paused ?? false;

    // TODO(Phase 6): also skip when the org's subscription/usage_counters
    // indicate quota is exhausted or billing is past_due — neither table
    // exists yet, so there's nothing to check here yet.
    if (tenantPaused || sitePaused) {
      results.push({
        scheduleId: schedule.id,
        action: tenantPaused ? "skipped:tenant_paused" : "skipped:site_paused",
      });
      // Still advance next_run_at — a paused schedule shouldn't build up a
      // backlog of "due" runs that all fire the moment it's unpaused.
      await database
        .from("schedules")
        .update({ next_run_at: computeNextRunAt(schedule.cadence, schedule.timezone, now).toISOString() })
        .eq("id", schedule.id);
      continue;
    }

    await start(contentPipelineWorkflow, [
      {
        organizationId: schedule.organization_id,
        siteConnectionId: schedule.site_connection_id,
        createdBy: schedule.created_by,
        topicHint: schedule.topic_hint,
        triggerType: "scheduled",
        scheduleId: schedule.id,
      },
    ]);

    await database
      .from("schedules")
      .update({ next_run_at: computeNextRunAt(schedule.cadence, schedule.timezone, now).toISOString() })
      .eq("id", schedule.id);

    results.push({ scheduleId: schedule.id, action: "started" });
  }

  return Response.json({ checked: dueSchedules?.length ?? 0, results });
};
