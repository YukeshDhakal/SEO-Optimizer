import { createClient } from "@repo/auth/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "../lib/organization";
import { type RunRow, RunsTable, contentTypeOf, topicOf } from "./components/runs-table";

export const metadata: Metadata = {
  title: "Runs",
  description: "Everything the agent did across every connected site.",
};

const startOfWindow = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

// The Workspace nav's "Runs" landing (root route) — a global, cross-site
// table, matching the neobrutalism handoff's Runs screen. Folds in the
// stat cards and "Waiting on you"/"Needs attention" triage panels from the
// previous Overview page rather than dropping them (per-site sites table
// dropped here since /sites, its own nav item now, already covers that).
const RunsLandingPage = async () => {
  const organization = await getCurrentOrganization();
  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const [
    { count: publishedCount },
    { count: blockedCount },
    { count: failedCount },
    { data: allRuns },
    { data: awaitingRuns },
    { data: pausedSites },
    { data: blockedRuns },
  ] = await Promise.all([
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("status", "published")
      .gte("published_at", startOfWindow(7)),
    supabase
      .from("pipeline_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("status", "blocked")
      .gte("started_at", startOfWindow(7)),
    supabase
      .from("pipeline_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("status", "failed")
      .gte("started_at", startOfWindow(7)),
    supabase
      .from("pipeline_runs")
      .select("id, input, status, current_step, trigger_type, started_at, site_connections(id, display_name)")
      .eq("organization_id", organization.id)
      .order("started_at", { ascending: false })
      .limit(50),
    supabase
      .from("pipeline_runs")
      .select("id, input, started_at, site_connections(id, display_name)")
      .eq("organization_id", organization.id)
      .eq("status", "running")
      .eq("current_step", "approval_gate")
      .order("started_at", { ascending: true })
      .limit(4),
    supabase
      .from("site_connections")
      .select("id, display_name, consecutive_publish_failures")
      .eq("organization_id", organization.id)
      .eq("paused", true)
      .gte("consecutive_publish_failures", 3),
    supabase
      .from("pipeline_runs")
      .select("id, input, site_connections(id, display_name)")
      .eq("organization_id", organization.id)
      .eq("status", "blocked")
      .order("started_at", { ascending: false })
      .limit(3),
  ]);

  const pausedCount = pausedSites?.length ?? 0;

  const stats = [
    { label: "Published, 7d", value: publishedCount ?? 0 },
    { label: "Awaiting approval", value: awaitingRuns?.length ?? 0 },
    { label: "Blocked by policy, 7d", value: blockedCount ?? 0 },
    { label: "Failed runs, 7d", value: failedCount ?? 0 },
    { label: "Sites auto paused", value: pausedCount },
  ];

  const rows: RunRow[] = (allRuns ?? []).map((run) => ({
    id: run.id,
    siteId: run.site_connections?.id ?? "",
    siteName: run.site_connections?.display_name ?? "Unknown site",
    topic: topicOf(run.input),
    status: run.status,
    currentStep: run.current_step,
    triggerType: run.trigger_type,
    startedAt: run.started_at,
    contentType: contentTypeOf(run.input),
  }));

  const attention = [
    ...(pausedSites ?? []).map((s) => ({
      key: `site-${s.id}`,
      title: `${s.display_name} auto paused`,
      detail: `${s.consecutive_publish_failures} consecutive publish failures. Fix credentials, then resume.`,
      href: `/sites/${s.id}`,
    })),
    ...(blockedRuns ?? []).map((r) => ({
      key: `run-${r.id}`,
      title: "A run was blocked by policy",
      detail: `${r.site_connections?.display_name ?? "A site"} · ${topicOf(r.input)}`,
      href: `/sites/${r.site_connections?.id}/runs`,
    })),
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">RUNS</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          Every pipeline run across every connected site. Anything red or
          amber wants a person.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div
            className="border-[3px] border-foreground bg-card p-3.5 shadow-[5px_5px_0_#111] transition-transform hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[9px_9px_0_#111]"
            key={s.label}
          >
            <div className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
              {s.label}
            </div>
            <div className="font-display mt-2 text-3xl tracking-tight">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <RunsTable
        emptyMessage="No runs yet. Connect a site and generate your first post."
        rows={rows}
        showSiteColumn={true}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="border-[3px] border-foreground bg-card p-4">
          <h2 className="font-display text-lg tracking-tight">
            WAITING ON YOU
          </h2>
          <div className="mt-3 flex flex-col divide-y-2 divide-foreground/15">
            {(awaitingRuns ?? []).map((run) => (
              <div className="flex items-center gap-3 py-3" key={run.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-sm">
                    {topicOf(run.input)}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {run.site_connections?.display_name} ·{" "}
                    {new Date(run.started_at).toLocaleString()}
                  </p>
                </div>
                <Link
                  className="shrink-0 border-2 border-foreground px-2.5 py-1 font-bold text-xs hover:bg-accent"
                  href={`/sites/${run.site_connections?.id}/runs/${run.id}`}
                >
                  Review
                </Link>
              </div>
            ))}
            {(awaitingRuns ?? []).length === 0 && (
              <p className="py-3 text-muted-foreground text-sm">
                Nothing waiting for review.
              </p>
            )}
          </div>
        </div>
        <div className="border-[3px] border-foreground bg-card p-4">
          <h2 className="font-display text-lg tracking-tight">
            NEEDS ATTENTION
          </h2>
          <div className="mt-3 flex flex-col divide-y-2 divide-foreground/15">
            {attention.map((a) => (
              <Link
                className="flex items-start gap-2.5 py-3 hover:text-primary"
                href={a.href}
                key={a.key}
              >
                <span className="mt-0.5 font-mono text-[10px] text-status-error-fg">
                  ✕
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm">{a.title}</p>
                  <p className="text-muted-foreground text-xs">{a.detail}</p>
                </div>
              </Link>
            ))}
            {attention.length === 0 && (
              <p className="py-3 text-muted-foreground text-sm">
                Nothing needs attention right now.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RunsLandingPage;
