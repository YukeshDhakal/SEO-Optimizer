import { database } from "@repo/database";
import { checkQuota, checkRateLimit, computeNextRunAt, contentPipelineWorkflow, writeAuditLog } from "@repo/workflows";
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
  organizations: { status: string } | null;
}

// Finds `schedules` that are due, skips anything paused at the tenant or
// site level (or blocked by quota/billing), starts a durable workflow run
// for the rest, and advances `next_run_at`. Same env var
// `content-pipeline.ts`'s `checkKillSwitch` step reads inside the workflow
// — checked again here too so a fleet of paused/stopped schedules doesn't
// even attempt `start()` in the first place, rather than starting a
// workflow run just to have it immediately block itself.
const isEmergencyStopped = () => process.env.EMERGENCY_STOP === "true";

export const GET = async (request: Request) => {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (isEmergencyStopped()) {
    return Response.json({ checked: 0, results: [], skipped: "emergency_stop" });
  }

  const now = new Date();

  const { data: dueSchedules, error } = await database
    .from("schedules")
    .select(
      "id, organization_id, site_connection_id, cadence, timezone, topic_hint, created_by, site_connections(paused), organizations(status)"
    )
    .eq("enabled", true)
    .lte("next_run_at", now.toISOString())
    .returns<DueScheduleRow[]>();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ scheduleId: string; action: string }> = [];

  // Shared by every "don't start this run" branch below — a schedule that
  // gets skipped still needs its `next_run_at` advanced (so a paused/
  // rate-limited/quota-exhausted schedule doesn't build up a backlog of
  // "due" runs that all fire the moment the block lifts) and an audit
  // trail entry (this *is* an autonomous-system action worth a "receipt",
  // per the audit log's whole purpose from Phase 5).
  const skipAndAdvance = async (
    schedule: DueScheduleRow,
    action: string,
    reason?: string
  ): Promise<void> => {
    results.push({ scheduleId: schedule.id, action });
    await writeAuditLog({
      organizationId: schedule.organization_id,
      actor: null,
      action: `schedule.${action}`,
      entityType: "schedule",
      entityId: schedule.id,
      metadata: reason ? { reason } : undefined,
    });
    await database
      .from("schedules")
      .update({ next_run_at: computeNextRunAt(schedule.cadence, schedule.timezone, now).toISOString() })
      .eq("id", schedule.id);
  };

  for (const schedule of dueSchedules ?? []) {
    // Billing-health gate — scoped to autonomous (cron-triggered) runs
    // only, per the plan's own wording ("halts autonomous publishing
    // tenant-wide"). A human directly clicking "Generate"/"Publish now" in
    // the dashboard is a deliberate action the org owner is taking on
    // their own account and isn't blocked by this — only the unattended
    // scheduled path is. Checked first, before even the DB round-trip for
    // tenant_settings, since a past_due org shouldn't spend that either.
    if (schedule.organizations?.status === "past_due" || schedule.organizations?.status === "suspended") {
      await skipAndAdvance(schedule, "skipped:billing_past_due", schedule.organizations.status);
      continue;
    }

    const { data: settings } = await database
      .from("tenant_settings")
      .select("paused")
      .eq("organization_id", schedule.organization_id)
      .maybeSingle();

    const tenantPaused = settings?.paused ?? false;
    const sitePaused = schedule.site_connections?.paused ?? false;

    if (tenantPaused || sitePaused) {
      await skipAndAdvance(schedule, tenantPaused ? "skipped:tenant_paused" : "skipped:site_paused");
      continue;
    }

    const rateLimit = await checkRateLimit(schedule.organization_id);
    if (rateLimit.blocked) {
      await skipAndAdvance(schedule, "skipped:rate_limited", rateLimit.reason);
      continue;
    }

    // Phase 6: same pre-`start()` short-circuit as the rate-limit check
    // above — the workflow's own `quota_check` step (see
    // content-pipeline.ts) would catch this too, but checking here first
    // avoids starting (and billing/logging) a workflow run just to have it
    // immediately block itself.
    const quota = await checkQuota(schedule.organization_id);
    if (quota.blocked) {
      await skipAndAdvance(schedule, "skipped:quota_exceeded", quota.reason);
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
