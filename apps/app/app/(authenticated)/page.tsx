import { createClient } from "@repo/auth/server";
import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "../lib/organization";
import { FilterableRunsTable } from "./components/filterable-runs-table";
import { type RunRow, contentTypeOf, topicOf } from "./components/runs-table";

export const metadata: Metadata = {
  title: "Runs",
  description: "Everything the agent did across every connected site.",
};

const startOfWindow = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const timeSince = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) {
    return `${Math.max(1, Math.floor(ms / (60 * 1000)))}m`;
  }
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
};

// Redesigned per the Quillrun Dashboard design doc's 1a ("Triage strip over
// the table") - triage moves above the table (previously below the fold),
// five equal stat cards collapse into one strip with real deltas, and the
// table's Stage column (see components/stage-progress.ts) stops printing
// raw DB values like `approval_gate`.
const RunsLandingPage = async () => {
  const organization = await getCurrentOrganization();
  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const [
    { count: publishedCount },
    { count: publishedPrevCount },
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
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("status", "published")
      .gte("published_at", startOfWindow(14))
      .lt("published_at", startOfWindow(7)),
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
  const publishedDelta = (publishedCount ?? 0) - (publishedPrevCount ?? 0);

  const stats = [
    {
      label: "Published, 7d",
      value: publishedCount ?? 0,
      delta: publishedDelta === 0 ? "" : publishedDelta > 0 ? `+${publishedDelta}` : `${publishedDelta}`,
    },
    {
      label: "Awaiting approval",
      value: awaitingRuns?.length ?? 0,
      delta: awaitingRuns?.[0] ? `oldest ${timeSince(awaitingRuns[0].started_at)}` : "",
    },
    { label: "Blocked by policy, 7d", value: blockedCount ?? 0, delta: "" },
    { label: "Failed runs, 7d", value: failedCount ?? 0, delta: "" },
    { label: "Sites auto paused", value: pausedCount, delta: pausedCount > 0 ? "needs creds" : "" },
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
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">RUNS</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
            Every run across every site.{" "}
            {awaitingRuns?.length || attention.length
              ? `${(awaitingRuns?.length ?? 0) + attention.length} things want a person right now.`
              : "Nothing needs you right now."}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/sites">Connect a site</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="border-[3px] border-foreground bg-brand-yellow">
          <div className="flex items-center gap-2.5 border-foreground border-b-[3px] px-4 py-2.5">
            <span className="font-display text-sm tracking-wide">WAITING ON YOU</span>
            <span className="border-2 border-foreground bg-card px-1.5 py-0.5 font-bold text-[11px]">
              {awaitingRuns?.length ?? 0}
            </span>
          </div>
          <div className="flex flex-col divide-y-2 divide-foreground/20">
            {(awaitingRuns ?? []).map((run) => (
              <div className="flex items-center gap-3 bg-card px-4 py-3" key={run.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-sm">{topicOf(run.input)}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {run.site_connections?.display_name} · waiting {timeSince(run.started_at)}
                  </p>
                </div>
                <Link
                  className="shrink-0 border-2 border-foreground bg-brand-lime px-3 py-1.5 font-bold text-xs hover:bg-card"
                  href={`/sites/${run.site_connections?.id}/runs/${run.id}`}
                >
                  Review
                </Link>
              </div>
            ))}
            {(awaitingRuns ?? []).length === 0 && (
              <p className="bg-card px-4 py-4 text-muted-foreground text-sm">
                Nothing waiting for review.
              </p>
            )}
          </div>
        </div>

        <div className="border-[3px] border-foreground bg-card">
          <div className="flex items-center gap-2.5 border-b px-4 py-2.5">
            <span className="font-display text-sm tracking-wide">NEEDS ATTENTION</span>
            <span className="border-2 border-foreground bg-brand-yellow px-1.5 py-0.5 font-bold text-[11px]">
              {attention.length}
            </span>
          </div>
          <div className="flex flex-col divide-y-2 divide-foreground/15">
            {attention.map((a) => (
              <Link className="flex items-start gap-2.5 px-4 py-3 hover:bg-muted/40" href={a.href} key={a.key}>
                <span className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center border-2 border-foreground bg-foreground font-bold text-[12px] text-background">
                  ✕
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm">{a.title}</p>
                  <p className="text-muted-foreground text-xs">{a.detail}</p>
                </div>
              </Link>
            ))}
            {attention.length === 0 && (
              <p className="px-4 py-4 text-muted-foreground text-sm">
                Nothing needs attention right now.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col divide-x-0 border-[3px] border-foreground bg-card sm:flex-row sm:divide-x-2 sm:divide-border">
        {stats.map((s) => (
          <div className="flex-1 border-border border-t-2 p-3.5 sm:border-t-0" key={s.label}>
            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              {s.label}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl tracking-tight">{s.value}</span>
              {s.delta && <span className="font-bold text-xs">{s.delta}</span>}
            </div>
          </div>
        ))}
      </div>

      <FilterableRunsTable
        emptyMessage="No runs yet. Connect a site and generate your first post."
        rows={rows}
        showSiteColumn={true}
      />
    </div>
  );
};

export default RunsLandingPage;
