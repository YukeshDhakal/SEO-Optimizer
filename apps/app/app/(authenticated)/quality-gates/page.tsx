import { createClient } from "@repo/auth/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "../../lib/organization";

export const metadata: Metadata = {
  title: "Quality gates",
};

const startOfWindow = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const topicOf = (input: unknown): string =>
  (input as { topicHint?: string } | null)?.topicHint ?? "Untitled run";

// Read-only aggregate over existing pipeline_runs data — no new table.
// "Quality gates" (SEO/GEO validation, policy check, site-reference check)
// don't persist a separate pass/fail record of their own; a run's terminal
// status plus its error message (set by markRunFailed/markRunBlocked) is
// the real record of why a gate rejected a draft, so this surfaces that
// directly rather than inventing new gate-result rows.
const QualityGatesPage = async () => {
  const organization = await getCurrentOrganization();
  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const [{ count: succeededCount }, { count: blockedCount }, { data: failedRuns }] =
    await Promise.all([
      supabase
        .from("pipeline_runs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("status", "succeeded")
        .gte("started_at", startOfWindow(30)),
      supabase
        .from("pipeline_runs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("status", "blocked")
        .gte("started_at", startOfWindow(30)),
      supabase
        .from("pipeline_runs")
        .select("id, input, error, started_at, site_connections(id, display_name)")
        .eq("organization_id", organization.id)
        .eq("status", "failed")
        .gte("started_at", startOfWindow(30))
        .order("started_at", { ascending: false })
        .limit(20),
    ]);

  const failedCount = failedRuns?.length ?? 0;
  const totalGated = (succeededCount ?? 0) + (blockedCount ?? 0) + failedCount;
  const passRate = totalGated === 0 ? null : Math.round(((succeededCount ?? 0) / totalGated) * 100);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">QUALITY GATES</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          SEO/GEO validation, policy check, and site-reference results across
          the last 30 days.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <div className="border-[3px] border-foreground bg-accent p-4">
          <div className="font-bold text-[10px] uppercase tracking-wider">Pass rate</div>
          <div className="font-display mt-2 text-3xl tracking-tight">
            {passRate === null ? "—" : `${passRate}%`}
          </div>
        </div>
        <div className="border-[3px] border-foreground bg-card p-4">
          <div className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
            Succeeded, 30d
          </div>
          <div className="font-display mt-2 text-3xl tracking-tight">
            {succeededCount ?? 0}
          </div>
        </div>
        <div className="border-[3px] border-foreground bg-card p-4">
          <div className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
            Blocked by policy, 30d
          </div>
          <div className="font-display mt-2 text-3xl tracking-tight">
            {blockedCount ?? 0}
          </div>
        </div>
        <div className="border-[3px] border-foreground bg-card p-4">
          <div className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
            Failed closed, 30d
          </div>
          <div className="font-display mt-2 text-3xl tracking-tight">{failedCount}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg tracking-tight">RECENT FAILURES</h2>
        {failedCount === 0 ? (
          <p className="font-medium text-muted-foreground text-sm">
            No gate failures in the last 30 days.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {(failedRuns ?? []).map((run) => (
              <Link
                className="flex flex-col gap-1.5 border-[3px] border-foreground bg-card p-4 shadow-[5px_5px_0_#111] transition-transform hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0_#111]"
                href={`/sites/${run.site_connections?.id}/runs/${run.id}`}
                key={run.id}
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="font-bold text-sm">{topicOf(run.input)}</p>
                  <p className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {run.site_connections?.display_name} ·{" "}
                    {new Date(run.started_at).toLocaleString()}
                  </p>
                </div>
                {run.error && (
                  <p className="text-status-error-fg text-xs leading-relaxed">
                    {run.error}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default QualityGatesPage;
