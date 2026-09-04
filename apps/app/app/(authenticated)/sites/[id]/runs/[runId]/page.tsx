import { createClient } from "@repo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../../../lib/organization";
import { RunDetailLive } from "./run-detail-live";

export const metadata: Metadata = {
  title: "Generation run",
};

interface RunDetailPageProperties {
  readonly params: Promise<{ id: string; runId: string }>;
}

// Phase 13: this page is now a thin data-fetch shell — all rendering
// (including what used to be a plain server-rendered snapshot) moved to
// RunDetailLive, a client component that keeps itself live via Supabase
// Realtime. Deliberately doesn't `notFound()` when `run` is missing: the
// manual "Generate post" action (generate.ts) redirects here the instant
// it registers the run, before the run necessarily exists as a row yet -
// RunDetailLive's own subscription (opened before the row exists) reliably
// picks up that insert once it lands and swaps out of its own "starting"
// state, so a brief null here is expected, not an error. `site` itself is
// still resolved here to gate on real org/site ownership, same as every
// other per-site page.
const RunDetailPage = async ({ params }: RunDetailPageProperties) => {
  const { id, runId } = await params;
  const organization = await getCurrentOrganization();

  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("site_connections")
    .select("id")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    redirect(`/sites/${id}`);
  }

  const { data: run } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("id", runId)
    .eq("site_connection_id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  const { data: steps } = await supabase
    .from("pipeline_run_steps")
    .select("*")
    .eq("pipeline_run_id", runId)
    .order("started_at", { ascending: true });

  const canManage =
    organization.role === "owner" || organization.role === "admin";

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <RunDetailLive
        canManage={canManage}
        initialRun={run}
        initialSteps={steps ?? []}
        runId={runId}
        siteConnectionId={id}
      />
    </div>
  );
};

export default RunDetailPage;
