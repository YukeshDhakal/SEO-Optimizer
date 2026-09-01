import { createClient } from "@repo/auth/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "../../lib/organization";

export const metadata: Metadata = {
  title: "Topics",
};

// Read-only, derived entirely from existing pipeline_run_steps.output for
// the topic_selection step — no new table, no mutations. This is the
// Workspace nav's "Topics" item from the neobrutalism handoff; there's no
// dedicated "topic" resource in the schema today, so this surfaces what
// topic_selection actually chose across recent runs rather than inventing
// a new managed entity.
const TopicsPage = async () => {
  const organization = await getCurrentOrganization();
  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const { data: steps } = await supabase
    .from("pipeline_run_steps")
    .select(
      "id, output, started_at, pipeline_runs!inner(id, organization_id, site_connections(id, display_name))"
    )
    .eq("step_name", "topic_selection")
    .eq("status", "succeeded")
    .eq("pipeline_runs.organization_id", organization.id)
    .order("started_at", { ascending: false })
    .limit(50);

  const topics = (steps ?? [])
    .map((step) => {
      const output = step.output as { topic?: string; primaryKeyword?: string } | null;
      if (!output?.topic) {
        return null;
      }
      return {
        id: step.id,
        topic: output.topic,
        primaryKeyword: output.primaryKeyword ?? "—",
        siteId: step.pipeline_runs?.site_connections?.id,
        siteName: step.pipeline_runs?.site_connections?.display_name ?? "Unknown site",
        runId: step.pipeline_runs?.id,
        startedAt: step.started_at,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">TOPICS</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          What topic_selection chose across recent runs, most recent first.
        </p>
      </div>

      {topics.length === 0 ? (
        <p className="font-medium text-muted-foreground text-sm">
          No topics selected yet.
        </p>
      ) : (
        <div className="overflow-x-auto border-[3px] border-foreground">
          <table className="w-full text-sm">
            <thead className="border-foreground border-b-[3px] bg-muted text-left font-bold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Topic</th>
                <th className="px-4 py-3">Primary keyword</th>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Selected</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr
                  className="border-foreground border-b-2 transition-colors last:border-b-0 hover:bg-accent/30"
                  key={t.id}
                >
                  <td className="max-w-sm truncate px-4 py-3.5 font-bold">
                    {t.siteId && t.runId ? (
                      <Link
                        className="hover:text-primary"
                        href={`/sites/${t.siteId}/runs/${t.runId}`}
                      >
                        {t.topic}
                      </Link>
                    ) : (
                      t.topic
                    )}
                  </td>
                  <td className="px-4 py-3.5 font-medium text-muted-foreground">
                    {t.primaryKeyword}
                  </td>
                  <td className="px-4 py-3.5 font-medium text-muted-foreground">
                    {t.siteName}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-muted-foreground text-xs">
                    {new Date(t.startedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TopicsPage;
