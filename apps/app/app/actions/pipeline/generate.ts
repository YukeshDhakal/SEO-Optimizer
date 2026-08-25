"use server";

import { createClient } from "@repo/auth/server";
import type { PipelineStepName } from "@repo/ai-engine";
import { runContentPipeline } from "@repo/ai-engine";
import type { Json, TablesUpdate } from "@repo/database";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "../../lib/organization";

export interface GeneratePostState {
  error?: string;
}

// Mirrors Phase 2's `publishPost` action shape (write a row, do the real
// work, update the row with the honest outcome either way) but for the
// multi-step AI pipeline: a `pipeline_runs` row is created up front so
// there's always a record even if the pipeline throws, and each step gets
// its own `pipeline_run_steps` row as `runContentPipeline`'s callbacks fire
// — this is what the run status page reads to show progress on reload.
export const generatePost = async (
  _prevState: GeneratePostState,
  formData: FormData
): Promise<GeneratePostState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  const topicHint = String(formData.get("topic_hint") ?? "").trim();

  if (!(siteConnectionId && topicHint)) {
    return { error: "A topic or niche hint is required." };
  }

  const organization = await getCurrentOrganization();
  if (!organization) {
    return { error: "No organization found for your account." };
  }
  if (!(organization.role === "owner" || organization.role === "admin")) {
    return { error: "Only owners and admins can generate posts." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in." };
  }

  const { data: site } = await supabase
    .from("site_connections")
    .select("id")
    .eq("id", siteConnectionId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!site) {
    return { error: "Site not found." };
  }

  const { data: run, error: insertError } = await supabase
    .from("pipeline_runs")
    .insert({
      organization_id: organization.id,
      site_connection_id: siteConnectionId,
      created_by: user.id,
      input: { topicHint },
    })
    .select("id")
    .single();

  if (insertError || !run) {
    return { error: "Couldn't start the pipeline run. Please try again." };
  }

  let currentStepRowId: string | null = null;

  const updateRunStatus = async (
    fields: TablesUpdate<"pipeline_runs">
  ): Promise<void> => {
    await supabase.from("pipeline_runs").update(fields).eq("id", run.id);
  };

  try {
    const result = await runContentPipeline(
      { organizationId: organization.id, topicHint },
      {
        onStepStart: async (step: PipelineStepName) => {
          await updateRunStatus({ current_step: step });
          const { data: stepRow } = await supabase
            .from("pipeline_run_steps")
            .insert({
              pipeline_run_id: run.id,
              step_name: step,
              status: "running",
            })
            .select("id")
            .single();
          currentStepRowId = stepRow?.id ?? null;
        },
        onStepComplete: async (_step, output) => {
          if (!currentStepRowId) {
            return;
          }
          await supabase
            .from("pipeline_run_steps")
            .update({
              status: "succeeded",
              // Every step's output is a plain, JSON-serializable value
              // (strings/objects/arrays of those) — safe to store as-is.
              output: output as Json,
              finished_at: new Date().toISOString(),
            })
            .eq("id", currentStepRowId);
        },
        onStepFailed: async (_step, error) => {
          if (!currentStepRowId) {
            return;
          }
          await supabase
            .from("pipeline_run_steps")
            .update({
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
              finished_at: new Date().toISOString(),
            })
            .eq("id", currentStepRowId);
        },
      }
    );

    if (result.status === "succeeded") {
      const { data: post } = await supabase
        .from("posts")
        .insert({
          organization_id: organization.id,
          site_connection_id: siteConnectionId,
          title: result.post.title,
          slug: result.post.slug,
          content_html: result.post.contentHtml,
          content_markdown: result.post.contentMarkdown,
          meta_title: result.post.metaTitle,
          meta_description: result.post.metaDescription,
          created_by: user.id,
        })
        .select("id")
        .single();

      await updateRunStatus({
        status: "succeeded",
        post_id: post?.id ?? null,
        finished_at: new Date().toISOString(),
      });
    } else if (result.status === "blocked") {
      await updateRunStatus({
        status: "blocked",
        error: result.reason,
        finished_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    await updateRunStatus({
      status: "failed",
      error: error instanceof Error ? error.message : "Generation failed.",
      finished_at: new Date().toISOString(),
    });
  }

  redirect(`/sites/${siteConnectionId}/runs/${run.id}`);
};
