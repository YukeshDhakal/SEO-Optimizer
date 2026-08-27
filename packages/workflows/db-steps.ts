// DB bookkeeping steps for the durable content pipeline workflow. All use
// the service-role `database` client (from `@repo/database`) — a workflow
// step runs detached from any end-user request/session, so there is no
// user-scoped cookie/JWT to bind an RLS-respecting client to here (the same
// reason the Phase 4 cron dispatcher, which has no user session at all,
// also has to use the service-role client). Callers (the manual "Generate
// post" server action, the cron dispatcher) are responsible for their own
// RLS-scoped authorization checks *before* calling `start()` — these steps
// trust the organizationId/siteConnectionId/userId they're given.
import { database } from "@repo/database";
import type { PipelineStepName } from "@repo/ai-engine";
import type { Json, TablesInsert } from "@repo/database";
import { marked } from "marked";

export interface CreateRunInput {
  organizationId: string;
  siteConnectionId: string;
  createdBy: string;
  topicHint: string;
  triggerType: "manual" | "scheduled";
  scheduleId?: string;
}

export const createPipelineRun = async (
  input: CreateRunInput
): Promise<{ runId: string }> => {
  "use step";

  const insert: TablesInsert<"pipeline_runs"> = {
    organization_id: input.organizationId,
    site_connection_id: input.siteConnectionId,
    created_by: input.createdBy,
    trigger_type: input.triggerType,
    schedule_id: input.scheduleId ?? null,
    input: { topicHint: input.topicHint } as Json,
  };

  const { data, error } = await database
    .from("pipeline_runs")
    .insert(insert)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create pipeline run: ${error?.message ?? "unknown error"}`);
  }

  return { runId: data.id };
};

export const getTenantSettings = async (
  organizationId: string
): Promise<{ requireApproval: boolean; paused: boolean }> => {
  "use step";

  const { data } = await database
    .from("tenant_settings")
    .select("require_approval, paused")
    .eq("organization_id", organizationId)
    .maybeSingle();

  // No row yet is not expected (create_organization_with_owner seeds one
  // atomically) but degrade to the column defaults rather than throw, since
  // a missing settings row should never be what blocks content generation.
  return {
    requireApproval: data?.require_approval ?? false,
    paused: data?.paused ?? false,
  };
};

// Phase 5 guardrail checks (kill_switch_check/rate_limit_check/
// duplicate_check) get recorded through this same bookkeeping as the
// original pipeline steps - `pipeline_run_steps.step_name` is a plain
// `text` column, no CHECK constraint, so widening this union is the only
// change needed to make them show up in the run detail UI identically to
// every other step.
export type ExtendedStepName =
  | PipelineStepName
  | "approval_gate"
  | "kill_switch_check"
  | "rate_limit_check"
  | "duplicate_check"
  | "quota_check";

export const recordStepStart = async (
  runId: string,
  stepName: ExtendedStepName
): Promise<{ stepRowId: string | null }> => {
  "use step";

  await database
    .from("pipeline_runs")
    .update({ current_step: stepName })
    .eq("id", runId);

  const { data } = await database
    .from("pipeline_run_steps")
    .insert({ pipeline_run_id: runId, step_name: stepName, status: "running" })
    .select("id")
    .single();

  return { stepRowId: data?.id ?? null };
};

export const recordStepComplete = async (
  stepRowId: string | null,
  output: unknown
): Promise<void> => {
  "use step";

  if (!stepRowId) {
    return;
  }
  await database
    .from("pipeline_run_steps")
    .update({
      status: "succeeded",
      output: output as Json,
      finished_at: new Date().toISOString(),
    })
    .eq("id", stepRowId);
};

export const recordStepFailed = async (
  stepRowId: string | null,
  errorMessage: string
): Promise<void> => {
  "use step";

  if (!stepRowId) {
    return;
  }
  await database
    .from("pipeline_run_steps")
    .update({
      status: "failed",
      error: errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq("id", stepRowId);
};

export interface FinalizePostInput {
  runId: string;
  organizationId: string;
  siteConnectionId: string;
  createdBy: string;
  title: string;
  slug: string;
  contentMarkdown: string;
  metaTitle: string;
  metaDescription: string;
}

// Writes the resulting `posts` row (status: 'draft' — Phase 2's existing
// "Publish now" flow owns actually publishing it, same handoff point Phase
// 3's manual path used) and marks the run succeeded. Markdown->HTML
// rendering happens here (a step, full Node/npm access) rather than in the
// workflow body — `"use workflow"` functions run in a sandboxed VM and the
// docs don't guarantee arbitrary npm packages work there, so every real
// piece of work, `marked` included, stays inside a step.
export const finalizeRunSucceeded = async (
  input: FinalizePostInput
): Promise<{ postId: string }> => {
  "use step";

  const contentHtml = await marked.parse(input.contentMarkdown);

  const { data: post, error } = await database
    .from("posts")
    .insert({
      organization_id: input.organizationId,
      site_connection_id: input.siteConnectionId,
      title: input.title,
      slug: input.slug,
      content_html: contentHtml,
      content_markdown: input.contentMarkdown,
      meta_title: input.metaTitle,
      meta_description: input.metaDescription,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error || !post) {
    throw new Error(`Failed to write draft post: ${error?.message ?? "unknown error"}`);
  }

  await database
    .from("pipeline_runs")
    .update({
      status: "succeeded",
      post_id: post.id,
      finished_at: new Date().toISOString(),
    })
    .eq("id", input.runId);

  return { postId: post.id };
};

export const markRunFailed = async (
  runId: string,
  errorMessage: string
): Promise<void> => {
  "use step";

  await database
    .from("pipeline_runs")
    .update({ status: "failed", error: errorMessage, finished_at: new Date().toISOString() })
    .eq("id", runId);
};

export const markRunBlocked = async (
  runId: string,
  reason: string
): Promise<void> => {
  "use step";

  await database
    .from("pipeline_runs")
    .update({ status: "blocked", error: reason, finished_at: new Date().toISOString() })
    .eq("id", runId);
};

export const markRunRejected = async (
  runId: string,
  reason: string
): Promise<void> => {
  "use step";

  await database
    .from("pipeline_runs")
    .update({ status: "rejected", error: reason, finished_at: new Date().toISOString() })
    .eq("id", runId);
};
