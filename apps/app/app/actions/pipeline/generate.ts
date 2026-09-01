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
// synchronous `runContentPipeline` call. `start()` returns immediately —
// this action still awaits `run.returnValue` so the existing
// redirect-to-the-finished-run UX is unchanged, but the run itself is now
// crash-resumable and step-cached under the hood, and the exact same
// workflow function is what the Phase 4 cron dispatcher calls for
// scheduled runs. All authorization (org membership/role, site ownership)
// happens here, via the request-scoped RLS client, *before* `start()` is
// called — the workflow's own steps run detached from this session and use
// the service-role client, trusting whatever input this action gives them.
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

  let runId: string;
  try {
    const run = await start(contentPipelineWorkflow, [
      {
        organizationId: organization.id,
        siteConnectionId,
        createdBy: user.id,
        topicHint,
        triggerType: "manual",
        contentType,
      },
    ]);
    const result = await run.returnValue;
    runId = result.runId;
  } catch {
    // The workflow's own steps record a terminal `pipeline_runs` status
    // (failed/blocked) for every handled failure mode before returning —
    // this catch only fires for something unexpected enough that no run
    // row exists to redirect to at all (e.g. `start()` itself couldn't
    // reach the workflow runtime).
    return { error: "Couldn't start the pipeline run. Please try again." };
  }

  redirect(`/sites/${siteConnectionId}/runs/${runId}`);
};
