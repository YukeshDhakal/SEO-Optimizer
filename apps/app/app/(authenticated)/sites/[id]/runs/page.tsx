import { createClient } from "@repo/auth/server";
import { StatusPill } from "@repo/design-system/components/status-pill";
import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../../lib/organization";
import { SiteTabs } from "../site-tabs";

export const metadata: Metadata = {
  title: "Generation runs",
};

interface RunsPageProperties {
  readonly params: Promise<{ id: string }>;
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

const topicOf = (input: unknown): string =>
  (input as { topicHint?: string } | null)?.topicHint ?? "Untitled run";

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

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Runs</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Every pipeline run for {site.display_name}, manual and scheduled.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={`/sites/${id}/generate`}>New run</Link>
        </Button>
      </div>

      <SiteTabs siteId={id} />

      {runs && runs.length > 0 ? (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2.5 font-medium">Topic</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Trigger</th>
                <th className="px-4 py-2.5 font-medium">Started</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {runs.map((run) => (
                <tr className="hover:bg-muted/30" key={run.id}>
                  <td className="max-w-xs truncate px-4 py-3 font-medium">
                    {topicOf(run.input)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={runPillStatus(run)}>
                      {runLabel(run)}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                    {run.trigger_type}
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                    {new Date(run.started_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      className="font-medium text-primary text-xs hover:underline"
                      href={`/sites/${id}/runs/${run.id}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No generation runs yet for this site.
        </p>
      )}
    </div>
  );
};

export default RunsPage;
