"use client";

import { createClient } from "@repo/auth/client";
import type { Tables } from "@repo/database";
import { StatusPill } from "@repo/design-system/components/status-pill";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApprovalActions } from "./approval-actions";
import { runLabel, runPillStatus } from "../../../../components/runs-table";
import { SiteTabs } from "../../site-tabs";

type PipelineRun = Tables<"pipeline_runs">;
type PipelineRunStep = Tables<"pipeline_run_steps">;

interface RunDetailLiveProperties {
  readonly initialRun: PipelineRun | null;
  readonly initialSteps: PipelineRunStep[];
  readonly runId: string;
  readonly siteConnectionId: string;
  readonly canManage: boolean;
}

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

const contentTypeOf = (input: unknown): "blog" | "faq" =>
  (input as { contentType?: string } | null)?.contentType === "faq"
    ? "faq"
    : "blog";

const lastSucceededOutput = (
  steps: PipelineRunStep[],
  stepName: string
): unknown =>
  steps
    .filter((s) => s.step_name === stepName && s.status === "succeeded")
    .at(-1)?.output;

// Phase 13: was a plain server-rendered snapshot (Phase 4's own comment on
// this file said as much) - now genuinely live. `generatePost` (the manual
// trigger) redirects here the instant the run registers, before any step
// has run, so `initialRun` can legitimately be `null` on first paint; this
// component's own Realtime subscription (not a poll - postgres_changes on
// pipeline_runs/pipeline_run_steps, enabled in the Phase 13 migration)
// picks up that row's insert the moment it lands, same channel whether the
// row already existed or not. RLS (is_org_member / is_org_member_for_
// pipeline_run) already scopes what this client can even receive, same as
// the initial server-side fetch.
export const RunDetailLive = ({
  initialRun,
  initialSteps,
  runId,
  siteConnectionId,
  canManage,
}: RunDetailLiveProperties) => {
  const [run, setRun] = useState(initialRun);
  const [steps, setSteps] = useState(initialSteps);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`run:${runId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pipeline_runs",
          filter: `id=eq.${runId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            return;
          }
          setRun(payload.new as PipelineRun);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pipeline_run_steps",
          filter: `pipeline_run_id=eq.${runId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            return;
          }
          const incoming = payload.new as PipelineRunStep;
          setSteps((prev) => {
            const next = prev.some((s) => s.id === incoming.id)
              ? prev.map((s) => (s.id === incoming.id ? incoming : s))
              : [...prev, incoming];
            return [...next].sort(
              (a, b) =>
                new Date(a.started_at).getTime() -
                new Date(b.started_at).getTime()
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId]);

  if (!run) {
    return (
      <>
        <SiteTabs siteId={siteConnectionId} />
        <div className="flex flex-col items-center gap-2 border-[3px] border-foreground bg-card px-4 py-10 text-center shadow-[6px_6px_0_#111]">
          <span className="size-2.5 animate-[qr-pulse_1.6s_ease-in-out_infinite] border border-foreground bg-status-info-fg" />
          <p className="font-medium text-sm">Starting your run…</p>
          <p className="max-w-sm text-muted-foreground text-xs">
            This updates the moment the run actually begins — no need to reload.
          </p>
        </div>
      </>
    );
  }

  const draftMarkdown = lastSucceededOutput(steps, "draft");
  const geoSeoOutput = lastSucceededOutput(steps, "geo_seo_optimize") as
    | { metaTitle?: unknown; metaDescription?: unknown }
    | null
    | undefined;

  const preview = {
    metaTitle:
      typeof geoSeoOutput?.metaTitle === "string"
        ? geoSeoOutput.metaTitle
        : null,
    metaDescription:
      typeof geoSeoOutput?.metaDescription === "string"
        ? geoSeoOutput.metaDescription
        : null,
    draftMarkdown: typeof draftMarkdown === "string" ? draftMarkdown : null,
  };

  const isAwaitingApproval =
    run.status === "running" && run.current_step === "approval_gate";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl tracking-tight">
              {topicOf(run.input)}
            </h1>
            <StatusPill status={runPillStatus(run)}>{runLabel(run)}</StatusPill>
            <span className="border-2 border-foreground bg-secondary px-2 py-0.5 font-bold text-[11px] text-secondary-foreground uppercase tracking-wide">
              {contentTypeOf(run.input) === "faq" ? "FAQ" : "Blog"}
            </span>
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
            href={`/sites/${siteConnectionId}/runs`}
          >
            Back to runs
          </Link>
          {run.post_id && (
            <Button asChild size="sm">
              <Link href={`/sites/${siteConnectionId}/posts`}>View post</Link>
            </Button>
          )}
        </div>
      </div>

      <SiteTabs siteId={siteConnectionId} />

      {isAwaitingApproval && canManage && (
        <div className="flex flex-wrap items-start gap-3 border-[3px] border-foreground bg-status-warning-bg px-4 py-3.5 shadow-[6px_6px_0_#111]">
          <span className="mt-0.5 font-mono text-status-warning-fg text-xs">
            ◎
          </span>
          <div className="min-w-[240px] flex-1">
            <p className="font-bold text-status-warning-fg text-sm">
              Paused, waiting for your approval
            </p>
            <p className="mt-0.5 text-status-warning-fg/85 text-xs">
              This draft cleared the quality and policy gates. Approve to
              publish it, or reject and the agent discards it and logs the
              reason.
            </p>
          </div>
          <ApprovalActions runId={run.id} siteConnectionId={siteConnectionId} />
        </div>
      )}

      {run.error && (
        <div className="border-[3px] border-foreground bg-status-error-bg px-4 py-3 font-medium text-status-error-fg text-sm">
          {run.error}
        </div>
      )}

      {(preview.metaTitle ||
        preview.metaDescription ||
        preview.draftMarkdown) && (
        <div className="overflow-hidden border-[3px] border-foreground bg-card shadow-[6px_6px_0_#111]">
          <div className="border-foreground border-b-[3px] px-4 py-3 font-display text-base tracking-tight">
            Generated content
          </div>
          <div className="flex flex-col gap-3 px-4 py-3.5">
            {preview.metaTitle && (
              <div>
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  Meta title
                </p>
                <p className="text-sm">{preview.metaTitle}</p>
              </div>
            )}
            {preview.metaDescription && (
              <div>
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  Meta description
                </p>
                <p className="text-sm">{preview.metaDescription}</p>
              </div>
            )}
            {preview.draftMarkdown && (
              <div>
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  Draft
                </p>
                <pre className="mt-1 max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {preview.draftMarkdown}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="overflow-hidden border-[3px] border-foreground bg-card shadow-[6px_6px_0_#111]">
        <div className="border-foreground border-b-[3px] px-4 py-3 font-display text-base tracking-tight">
          Stage timeline
        </div>
        {steps.length > 0 ? (
          <div className="flex flex-col divide-y-2 divide-foreground">
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
                <StatusPill
                  className="shrink-0"
                  status={stepPillStatus(step.status)}
                >
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
    </>
  );
};
