"use server";

import { createClient } from "@repo/auth/server";
import { revalidatePath } from "next/cache";
import { resumeHook } from "workflow/api";
import { getCurrentOrganization } from "../../lib/organization";

export interface ResolveApprovalState {
  error?: string;
}

// Resumes a workflow suspended at the `approval_gate` step (see
// packages/workflows/content-pipeline.ts) — the deterministic
// `approval:{runId}` token lets this be called from a plain server action
// without the workflow runtime needing to hand back anything itself.
// Ownership/role check happens here (RLS-scoped client) before touching the
// workflow; `resumeHook` has no concept of this app's tenancy on its own.
export const resolveApproval = async (
  runId: string,
  siteConnectionId: string,
  approved: boolean
): Promise<ResolveApprovalState> => {
  const organization = await getCurrentOrganization();
  if (!organization) {
    return { error: "No organization found for your account." };
  }
  if (!(organization.role === "owner" || organization.role === "admin")) {
    return { error: "Only owners and admins can approve or reject a run." };
  }

  const supabase = await createClient();
  const { data: run } = await supabase
    .from("pipeline_runs")
    .select("id, status, current_step")
    .eq("id", runId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!run) {
    return { error: "Run not found." };
  }
  if (!(run.status === "running" && run.current_step === "approval_gate")) {
    return { error: "This run isn't waiting for approval." };
  }

  try {
    await resumeHook(`approval:${runId}`, { approved });
  } catch {
    return { error: "Couldn't resolve the approval. Please try again." };
  }

  revalidatePath(`/sites/${siteConnectionId}/runs/${runId}`);
  return {};
};
