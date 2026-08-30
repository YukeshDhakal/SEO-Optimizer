import { createClient } from "@repo/auth/server";
import { StatusPill } from "@repo/design-system/components/status-pill";
import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../lib/organization";
import { PauseToggleButton } from "../pause-toggle-button";
import { ConnectGoogleAdsForm } from "./connect-google-ads-form";
import { ConnectSearchConsoleForm } from "./connect-search-console-form";
import { ConnectShopifyForm } from "./connect-shopify-form";
import { ConnectWebflowForm } from "./connect-webflow-form";
import { ConnectWordPressForm } from "./connect-wordpress-form";
import { DeleteSiteButton } from "./delete-site-button";
import { EditSiteForm } from "./edit-site-form";
import { SiteTabs } from "./site-tabs";

export const metadata: Metadata = {
  title: "Site details",
};

interface SiteDetailPageProperties {
  readonly params: Promise<{ id: string }>;
}

const startOfWindow = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

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
    return `Running — ${run.current_step ?? "starting"}`;
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

const SiteDetailPage = async ({ params }: SiteDetailPageProperties) => {
  const { id } = await params;
  const organization = await getCurrentOrganization();

  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  // Scoped to organization_id too, not just id — RLS already enforces this,
  // but matching it here means a cross-tenant id reliably 404s instead of
  // depending solely on the RLS layer to explain the empty result.
  const { data: site } = await supabase
    .from("site_connections")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    notFound();
  }

  const [
    { data: searchConsoleCredentials },
    { data: topGscQueries },
    { data: googleAdsCredentials },
    { data: cachedKeywords },
    { count: published30d },
    { count: runs30d },
    { count: succeeded30d },
    { data: recentRuns },
  ] = await Promise.all([
    supabase
      .from("search_console_credentials")
      .select("status, gsc_site_url")
      .eq("site_connection_id", site.id)
      .maybeSingle(),
    supabase
      .from("search_console_queries")
      .select("query, clicks")
      .eq("site_connection_id", site.id)
      .order("clicks", { ascending: false })
      .limit(5),
    supabase
      .from("google_ads_credentials")
      .select("status, google_ads_customer_id")
      .eq("site_connection_id", site.id)
      .maybeSingle(),
    supabase
      .from("keyword_research")
      .select("keyword, avg_monthly_searches")
      .eq("site_connection_id", site.id)
      .order("avg_monthly_searches", { ascending: false })
      .limit(5),
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("site_connection_id", site.id)
      .eq("status", "published")
      .gte("published_at", startOfWindow(30)),
    supabase
      .from("pipeline_runs")
      .select("id", { count: "exact", head: true })
      .eq("site_connection_id", site.id)
      .gte("started_at", startOfWindow(30)),
    supabase
      .from("pipeline_runs")
      .select("id", { count: "exact", head: true })
      .eq("site_connection_id", site.id)
      .eq("status", "succeeded")
      .gte("started_at", startOfWindow(30)),
    supabase
      .from("pipeline_runs")
      .select("id, input, status, current_step, started_at")
      .eq("site_connection_id", site.id)
      .order("started_at", { ascending: false })
      .limit(4),
  ]);

  const canManage =
    organization.role === "owner" || organization.role === "admin";

  const siteStats = [
    { label: "Published, 30d", value: published30d ?? 0 },
    { label: "Runs, 30d", value: runs30d ?? 0 },
    {
      label: "Runs succeeded, 30d",
      value:
        runs30d && runs30d > 0
          ? `${Math.round(((succeeded30d ?? 0) / runs30d) * 100)}%`
          : "—",
    },
    {
      label: "Publish failures",
      value: site.consecutive_publish_failures,
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="rounded-md border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-semibold text-xl tracking-tight">
                {site.display_name}
              </h1>
              <StatusPill status={site.status === "connected" ? "ok" : "await"}>
                {site.status === "connected" ? "Connected" : site.status}
              </StatusPill>
              {site.paused && <StatusPill status="paused" />}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 font-mono text-muted-foreground text-xs">
              <span>{site.cms_type}</span>
              <span>{site.base_url}</span>
              <span>
                connected {new Date(site.created_at).toLocaleDateString()}
              </span>
              {site.consecutive_publish_failures > 0 && (
                <span className="text-status-error-fg">
                  {site.consecutive_publish_failures} consecutive failures
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {site.status === "connected" && (
              <>
                <Button asChild size="sm">
                  <Link href={`/sites/${site.id}/generate`}>Generate</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/sites/${site.id}/posts/new`}>New post</Link>
                </Button>
              </>
            )}
            {canManage && (
              <PauseToggleButton
                id={site.id}
                organizationId={organization.id}
                paused={site.paused}
              />
            )}
          </div>
        </div>
      </div>

      {site.paused && site.consecutive_publish_failures >= 3 && (
        // The only path that currently sets `paused=true` at 3+ failures
        // is the `auto_pause_site_on_repeated_failures` DB trigger — a
        // manual pause via the toggle above resets the failure count to 0,
        // so this combination reliably means "auto-paused", not "an admin
        // chose to pause this."
        <div className="flex items-center justify-between gap-4 rounded-md border border-status-error-fg/25 bg-status-error-bg px-4 py-3 text-sm text-status-error-fg">
          <p>
            <strong>Automatically paused</strong> after{" "}
            {site.consecutive_publish_failures} consecutive publish
            failures. Fix the underlying issue (check credentials/site
            reachability), then resume.
          </p>
        </div>
      )}

      <SiteTabs siteId={site.id} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {siteStats.map((s) => (
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="rounded-md border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold text-sm">Recent runs</span>
            <Link
              className="font-medium text-primary text-xs hover:underline"
              href={`/sites/${site.id}/runs`}
            >
              All runs
            </Link>
          </div>
          <div className="flex flex-col divide-y">
            {(recentRuns ?? []).map((run) => (
              <Link
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30"
                href={`/sites/${site.id}/runs/${run.id}`}
                key={run.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">
                    {topicOf(run.input)}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {new Date(run.started_at).toLocaleString()}
                  </p>
                </div>
                <StatusPill status={runPillStatus(run)}>
                  {runLabel(run)}
                </StatusPill>
              </Link>
            ))}
            {(recentRuns ?? []).length === 0 && (
              <p className="px-4 py-4 text-muted-foreground text-sm">
                No runs yet.{" "}
                <Link
                  className="text-primary hover:underline"
                  href={`/sites/${site.id}/generate`}
                >
                  Generate the first one
                </Link>
                .
              </p>
            )}
          </div>
        </div>

        <EditSiteForm site={site} />
      </div>

      {canManage && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="mb-3 font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
              Connections
            </h2>
            <div className="flex flex-col gap-4">
              {site.cms_type === "wordpress" && (
                <ConnectWordPressForm siteConnectionId={site.id} />
              )}
              {site.cms_type === "shopify" && (
                <ConnectShopifyForm
                  shopDomain={site.base_url ?? ""}
                  siteConnectionId={site.id}
                />
              )}
              {site.cms_type === "webflow" && (
                <ConnectWebflowForm siteConnectionId={site.id} />
              )}
              <ConnectSearchConsoleForm
                credentials={
                  searchConsoleCredentials
                    ? {
                        status: searchConsoleCredentials.status as
                          | "pending"
                          | "connected"
                          | "error",
                        gscSiteUrl: searchConsoleCredentials.gsc_site_url,
                      }
                    : null
                }
                siteConnectionId={site.id}
                topQueries={topGscQueries ?? []}
              />
              <ConnectGoogleAdsForm
                cachedKeywords={(cachedKeywords ?? []).map((row) => ({
                  keyword: row.keyword,
                  avgMonthlySearches: row.avg_monthly_searches,
                }))}
                credentials={
                  googleAdsCredentials
                    ? {
                        status: googleAdsCredentials.status as
                          | "pending"
                          | "connected"
                          | "error",
                        googleAdsCustomerId:
                          googleAdsCredentials.google_ads_customer_id,
                      }
                    : null
                }
                siteConnectionId={site.id}
              />
            </div>
          </div>

          <div className="rounded-md border border-status-error-fg/25 bg-status-error-bg/40 p-4">
            <h2 className="mb-1 font-semibold text-sm">Danger zone</h2>
            <p className="mb-3 text-muted-foreground text-xs">
              Deleting a site removes it and its history. This cannot be
              undone.
            </p>
            <DeleteSiteButton id={site.id} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SiteDetailPage;
