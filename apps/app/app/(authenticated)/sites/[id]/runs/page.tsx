import { createClient } from "@repo/auth/server";
import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../../lib/organization";
import { type RunRow, RunsTable, contentTypeOf, topicOf } from "../../../components/runs-table";
import { SiteTabs } from "../site-tabs";

export const metadata: Metadata = {
  title: "Generation runs",
};

interface RunsPageProperties {
  readonly params: Promise<{ id: string }>;
}

const RunsPage = async ({ params }: RunsPageProperties) => {
  const { id } = await params;
  const organization = await getCurrentOrganization();

  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("site_connections")
    .select("display_name")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    notFound();
  }

  const { data: runs } = await supabase
    .from("pipeline_runs")
    .select("id, input, status, current_step, trigger_type, started_at")
    .eq("site_connection_id", id)
    .order("started_at", { ascending: false });

  const rows: RunRow[] = (runs ?? []).map((run) => ({
    id: run.id,
    siteId: id,
    siteName: site.display_name,
    topic: topicOf(run.input),
    status: run.status,
    currentStep: run.current_step,
    triggerType: run.trigger_type,
    startedAt: run.started_at,
    contentType: contentTypeOf(run.input),
  }));

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">RUNS</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Every pipeline run for {site.display_name}, manual and scheduled.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={`/sites/${id}/generate`}>New run</Link>
        </Button>
      </div>

      <SiteTabs siteId={id} />

      <RunsTable
        emptyMessage="No generation runs yet for this site."
        rows={rows}
        showSiteColumn={false}
      />
    </div>
  );
};

export default RunsPage;
