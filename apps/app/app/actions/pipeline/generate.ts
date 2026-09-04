"use server";

import { createClient } from "@repo/auth/server";
import { contentPipelineWorkflow } from "@repo/workflows";
import { redirect } from "next/navigation";
import { start } from "workflow/api";
import { getCurrentOrganization } from "../../lib/organization";

export interface GeneratePostState {
  error?: string;
}

// Phase 4: the manual "Generate post" trigger now runs the durable
// Workflow DevKit pipeline (`@repo/workflows`) instead of Phase 3's
// synchronous `runContentPipeline` call. All authorization (org
// membership/role, site ownership) happens here, via the request-scoped
// RLS client, *before* `start()` is called — the workflow's own steps run
// detached from this session and use the service-role client, trusting
// whatever input this action gives them.
//
// Phase 13: this action generates the run's id itself (crypto.randomUUID())
// and redirects the moment `start()` resolves, WITHOUT awaiting
// `run.returnValue` — `start()` only registers the durable run and returns;
// awaiting `returnValue` is what used to block for the whole multi-minute
// pipeline (see node_modules/@workflow/core's own Run class: `returnValue`
// is documented as "Polls ... until it is completed"). The cron dispatcher
// (apps/api) has done exactly this fire-and-forget pattern successfully in
// production since Phase 4; this just extends it to the manual path so the
// run-detail page's own Realtime subscription can show real live progress
// instead of the user staring at a static button for minutes.
export const generatePost = async (
  _prevState: GeneratePostState,
  formData: FormData
): Promise<GeneratePostState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  const topicHint = String(formData.get("topic_hint") ?? "").trim();
  const contentTypeRaw = String(formData.get("content_type") ?? "blog");
  const contentType = contentTypeRaw === "faq" ? "faq" : "blog";

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

  const runId = crypto.randomUUID();
  try {
    await start(contentPipelineWorkflow, [
      {
        organizationId: organization.id,
        siteConnectionId,
        createdBy: user.id,
        topicHint,
        triggerType: "manual",
        contentType,
        runId,
      },
    ]);
  } catch {
    // Genuinely unexpected: `start()` itself couldn't reach the workflow
    // runtime, before the pipeline's own steps ever ran. Every handled
    // failure mode inside the pipeline (blocked/failed/rejected) is
    // recorded onto the pipeline_runs row this action already generated
    // an id for above, so this catch is specifically "the run never even
    // registered," not "the run failed."
    return { error: "Couldn't start the pipeline run. Please try again." };
  }

  redirect(`/sites/${siteConnectionId}/runs/${runId}`);
};
