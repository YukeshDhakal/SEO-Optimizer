import { createClient } from "@repo/auth/server";
import { StatusPill } from "@repo/design-system/components/status-pill";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "../lib/organization";

export const metadata: Metadata = {
  title: "Overview",
  description: "Everything the agent did across every connected site.",
};

const startOfWindow = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

// The cross-site overview the design handoff put at the root route -
// ROUTING_SPEC.md flagged `/` as "still the starter dashboard", the
// most-visited destination in the product rendering a placeholder. Real
// data throughout: no mock stats, no sparklines that would need history
// this schema doesn't track yet - every number here is a live count.
const OverviewPage = async () => {
  const organization = await getCurrentOrganization();
  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const [
    { count: publishedCount },
    { count: blockedCount },
    { count: failedCount },
    { data: sites },
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
      .from("site_connections")
      .select("id, display_name, cms_type, status, paused, consecutive_publish_failures")
      .eq("organization_id", organization.id)
      .order("display_name", { ascending: true }),
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

  const topicOf = (input: unknown): string =>
    (input as { topicHint?: string } | null)?.topicHint ?? "Untitled run";

  const pausedCount = pausedSites?.length ?? 0;

  const stats = [
    { label: "Published, 7d", value: publishedCount ?? 0 },
    { label: "Awaiting approval", value: awaitingRuns?.length ?? 0 },
    { label: "Blocked by policy, 7d", value: blockedCount ?? 0 },
    { label: "Failed runs, 7d", value: failedCount ?? 0 },
    { label: "Sites auto paused", value: pausedCount },
  ];

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
        <h1 className="font-semibold text-2xl tracking-tight">
          Across all sites
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          Everything the agent did in the last seven days, grouped by client
          site. Anything red or amber wants a person.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div className="rounded-md border bg-card p-3.5" key={s.label}>
            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              {s.label}
            </div>
            <div className="mt-2 font-semibold text-2xl tracking-tight">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2.5 font-medium">Client site</th>
              <th className="px-4 py-2.5 font-medium">CMS</th>
              <th className="px-4 py-2.5 font-medium">State</th>
              <th className="px-4 py-2.5 font-medium">Failures</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {(sites ?? []).map((site) => (
              <tr className="hover:bg-muted/30" key={site.id}>
                <td className="px-4 py-3 font-medium">
                  <Link className="hover:underline" href={`/sites/${site.id}`}>
                    {site.display_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {site.cms_type}
                </td>
                <td className="px-4 py-3">
                  <StatusPill
                    status={
                      site.paused
                        ? "paused"
                        : site.status === "error"
                          ? "failed"
                          : site.status === "connected"
                            ? "ok"
                            : "await"
                    }
                  />
                </td>
                <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                  {site.consecutive_publish_failures}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    className="font-medium text-primary text-xs hover:underline"
                    href={`/sites/${site.id}`}
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {(sites ?? []).length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-muted-foreground text-sm" colSpan={5}>
                  No sites connected yet.{" "}
                  <Link className="text-primary hover:underline" href="/sites">
                    Connect one
                  </Link>
                  .
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-md border bg-card p-4">
          <h2 className="font-semibold text-sm">Waiting on you</h2>
          <div className="mt-3 flex flex-col divide-y">
            {(awaitingRuns ?? []).map((run) => (
              <div className="flex items-center gap-3 py-2.5" key={run.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">
                    {topicOf(run.input)}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {run.site_connections?.display_name} ·{" "}
                    {new Date(run.started_at).toLocaleString()}
                  </p>
                </div>
                <Link
                  className="shrink-0 rounded-md border px-2.5 py-1 font-medium text-xs hover:bg-muted"
                  href={`/sites/${run.site_connections?.id}/runs/${run.id}`}
                >
                  Review
                </Link>
              </div>
            ))}
            {(awaitingRuns ?? []).length === 0 && (
              <p className="py-2.5 text-muted-foreground text-sm">
                Nothing waiting for review.
              </p>
            )}
          </div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <h2 className="font-semibold text-sm">Needs attention</h2>
          <div className="mt-3 flex flex-col divide-y">
            {attention.map((a) => (
              <Link
                className="flex items-start gap-2.5 py-2.5"
                href={a.href}
                key={a.key}
              >
                <span className="mt-0.5 font-mono text-[10px] text-status-error-fg">
                  ✕
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{a.title}</p>
                  <p className="text-muted-foreground text-xs">{a.detail}</p>
                </div>
              </Link>
            ))}
            {attention.length === 0 && (
              <p className="py-2.5 text-muted-foreground text-sm">
                Nothing needs attention right now.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewPage;
