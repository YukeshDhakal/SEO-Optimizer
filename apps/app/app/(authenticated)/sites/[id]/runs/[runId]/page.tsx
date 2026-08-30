import { createClient } from "@repo/auth/server";
import { StatusPill } from "@repo/design-system/components/status-pill";
import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../../../lib/organization";
import { SiteTabs } from "../../site-tabs";
import { ApprovalActions } from "./approval-actions";

export const metadata: Metadata = {
  title: "Generation run",
};

interface RunDetailPageProperties {
  readonly params: Promise<{ id: string; runId: string }>;
}

const runPillStatus = (run: { status: string; current_step: string | null }) => {
  if (run.status === "running" && run.current_step === "approval_gate") {
    return "await" as const;
  }
  if (run.status === "running") {
    return "running" as const;
  }
  if (run.status === "succeeded") {
    return "ok" as const;
  }
  if (run.status === "blocked" || run.status === "rejected") {
    return "blocked" as const;
  }
  return "failed" as const;
};

const runLabel = (run: { status: string; current_step: string | null }) => {
  if (run.status === "running" && run.current_step === "approval_gate") {
    return "Awaiting approval";
  }
  if (run.status === "running") {
    return "Running";
  }
  if (run.status === "succeeded") {
    return "Published";
  }
  if (run.status === "blocked") {
    return "Blocked by policy";
  }
  if (run.status === "rejected") {
    return "Rejected";
  }
  return "Failed";
};

const stepPillStatus = (status: string) => {
  if (status === "succeeded") {
    return "ok" as const;
  }
  if (status === "running") {
    return "running" as const;
  }
  if (status === "retried") {
    return "await" as const;
  }
  return "failed" as const;
};

const topicOf = (input: unknown): string =>
  (input as { topicHint?: string } | null)?.topicHint ?? "Untitled run";

// Still a read-on-load view, not a live/streaming one — Phase 4 made the
// underlying run durable (real Workflow DevKit steps, resumable across a
// crash, cacheable per-step) but this page reads the same
// pipeline_runs/pipeline_run_steps snapshot Phase 3 did, just refreshed by
// reloading. A real SSE/live timeline (per the design handoff's Generate
// screen) is a later, separate improvement, not required for durability
// itself. A run can now legitimately sit at status "running" with
// current_step "approval_gate" indefinitely (a real suspend, not a stall)
// when the org's tenant_settings.require_approval is on.
const RunDetailPage = async ({ params }: RunDetailPageProperties) => {
  const { id, runId } = await params;
  const organization = await getCurrentOrganization();

  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const { data: run } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("id", runId)
    .eq("site_connection_id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!run) {
    notFound();
  }

  const { data: steps } = await supabase
    .from("pipeline_run_steps")
    .select("*")
    .eq("pipeline_run_id", runId)
    .order("started_at", { ascending: true });

  const isAwaitingApproval =
    run.status === "running" && run.current_step === "approval_gate";
  const canManage =
    organization.role === "owner" || organization.role === "admin";

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-semibold text-xl tracking-tight">
              {topicOf(run.input)}
            </h1>
            <StatusPill status={runPillStatus(run)}>
              {runLabel(run)}
            </StatusPill>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 font-mono text-muted-foreground text-xs">
            <span>{run.trigger_type}</span>
            <span>started {new Date(run.started_at).toLocaleString()}</span>
            {run.finished_at && (
              <span>finished {new Date(run.finished_at).toLocaleString()}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            className="font-medium text-primary text-xs hover:underline"
            href={`/sites/${id}/runs`}
          >
            Back to runs
          </Link>
          {run.post_id && (
            <Button asChild size="sm">
              <Link href={`/sites/${id}/posts`}>View post</Link>
            </Button>
          )}
        </div>
      </div>

      <SiteTabs siteId={id} />

      {isAwaitingApproval && canManage && (
        <div className="flex flex-wrap items-start gap-3 rounded-md border border-status-warning-fg/30 bg-status-warning-bg px-4 py-3.5">
          <span className="mt-0.5 font-mono text-status-warning-fg text-xs">
            ◎
          </span>
          <div className="min-w-[240px] flex-1">
            <p className="font-semibold text-status-warning-fg text-sm">
              Paused, waiting for your approval
            </p>
            <p className="mt-0.5 text-status-warning-fg/85 text-xs">
              This draft cleared the quality and policy gates. Approve to
              publish it, or reject and the agent discards it and logs the
              reason.
            </p>
          </div>
          <ApprovalActions runId={run.id} siteConnectionId={id} />
        </div>
      )}

      {run.error && (
        <div className="rounded-md border border-status-error-fg/25 bg-status-error-bg px-4 py-3 text-status-error-fg text-sm">
          {run.error}
        </div>
      )}

      <div className="overflow-hidden rounded-md border bg-card">
        <div className="border-b px-4 py-3 font-semibold text-sm">
          Stage timeline
        </div>
        {steps && steps.length > 0 ? (
          <div className="flex flex-col divide-y">
            {steps.map((step) => (
              <div
                className="flex items-start justify-between gap-4 px-4 py-3.5"
                key={step.id}
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm">{step.step_name}</p>
                  {step.error && (
                    <p className="mt-1 max-w-xl whitespace-pre-wrap text-status-error-fg text-xs">
                      {step.error}
                    </p>
                  )}
                </div>
                <StatusPill className="shrink-0" status={stepPillStatus(step.status)}>
                  {step.status}
                </StatusPill>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-4 text-muted-foreground text-sm">
            No step data recorded yet.
          </p>
        )}
      </div>
    </div>
  );
};

export default RunDetailPage;
