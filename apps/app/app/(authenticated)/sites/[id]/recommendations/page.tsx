import { createClient } from "@repo/auth/server";
import {
  type PillStatus,
  StatusPill,
} from "@repo/design-system/components/status-pill";
import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  dismissRecommendation,
  markRecommendationActioned,
} from "../../../../actions/recommendations/mutate";
import { getCurrentOrganization } from "../../../../lib/organization";
import { SiteTabs } from "../site-tabs";

export const metadata: Metadata = { title: "Recommendations" };

interface RecommendationsPageProperties {
  readonly params: Promise<{ id: string }>;
}

// Maps onto the existing, fixed PillStatus union rather than adding new
// states to the design system: a recommendation nobody has looked at yet is
// exactly the "awaiting a human" case the `await` pill already means.
const STATUS_PILL: Record<string, PillStatus> = {
  new: "await",
  dismissed: "paused",
  actioned: "ok",
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  dismissed: "Dismissed",
  actioned: "Actioned",
};

// Sorted in memory rather than in the query. Both `status` and `priority` are
// text columns whose values don't sort meaningfully by their own alphabetical
// order ('actioned' < 'dismissed' < 'new' would bury the only rows that need
// attention, and 'high' < 'low' < 'medium' is likewise backwards), and adding
// a sort_order column purely for display would be schema weight for nothing.
const STATUS_RANK: Record<string, number> = {
  new: 0,
  actioned: 1,
  dismissed: 2,
};

const PRIORITY_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const TYPE_LABEL: Record<string, string> = {
  title_meta_rewrite: "Title / meta",
  keyword_gap: "Keyword gap",
  indexing_problem: "Indexing",
  zero_traction: "Zero traction",
};

const formatMetrics = (metrics: unknown): string => {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    return "";
  }
  return Object.entries(metrics as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
};

const RecommendationsPage = async ({ params }: RecommendationsPageProperties) => {
  const { id } = await params;
  const organization = await getCurrentOrganization();

  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("site_connections")
    .select("id, display_name")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    notFound();
  }

  const { data: rows } = await supabase
    .from("content_recommendations")
    .select("*")
    .eq("site_connection_id", id)
    .order("created_at", { ascending: false });

  const recommendations = [...(rows ?? [])].sort((a, b) => {
    const byStatus =
      (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    if (byStatus !== 0) {
      return byStatus;
    }
    return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  });

  const canManage =
    organization.role === "owner" || organization.role === "admin";

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">RECOMMENDATIONS</h1>
        <p className="mt-1 max-w-xl text-muted-foreground text-sm">
          What the agent found worth fixing on {site.display_name}, from Search
          Console performance, Keyword Planner volume and Google's own indexing
          verdicts. Regenerated daily — dismissing one keeps it dismissed.
        </p>
      </div>

      <SiteTabs siteId={id} />

      <div className="border-[3px] border-foreground bg-card shadow-[6px_6px_0_#111]">
        <div className="border-foreground border-b-[3px] px-5 py-3.5 font-display text-base tracking-tight">
          OPEN RECOMMENDATIONS
        </div>
        <div className="px-5">
          {recommendations.length > 0 ? (
            <div className="flex flex-col divide-y-2 divide-foreground">
              {recommendations.map((recommendation) => (
                <div
                  className="flex flex-wrap items-start justify-between gap-3 py-3.5"
                  key={recommendation.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-sm">
                        {recommendation.title}
                      </p>
                      <span className="border-2 border-foreground px-1.5 py-0.5 font-bold text-[10px] uppercase">
                        {recommendation.priority}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {TYPE_LABEL[recommendation.recommendation_type] ??
                          recommendation.recommendation_type}
                      </span>
                    </div>
                    <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
                      {recommendation.description}
                    </p>
                    {formatMetrics(recommendation.metrics) && (
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {formatMetrics(recommendation.metrics)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill
                      status={STATUS_PILL[recommendation.status] ?? "draft"}
                    >
                      {STATUS_LABEL[recommendation.status] ??
                        recommendation.status}
                    </StatusPill>
                    {canManage && recommendation.status !== "actioned" && (
                      <form action={markRecommendationActioned}>
                        <input
                          name="id"
                          type="hidden"
                          value={recommendation.id}
                        />
                        <input
                          name="site_connection_id"
                          type="hidden"
                          value={id}
                        />
                        <Button size="sm" type="submit" variant="outline">
                          Mark done
                        </Button>
                      </form>
                    )}
                    {canManage && recommendation.status !== "dismissed" && (
                      <form action={dismissRecommendation}>
                        <input
                          name="id"
                          type="hidden"
                          value={recommendation.id}
                        />
                        <input
                          name="site_connection_id"
                          type="hidden"
                          value={id}
                        />
                        <Button size="sm" type="submit" variant="outline">
                          Dismiss
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-muted-foreground text-sm">
              Nothing to fix yet — either everything checks out, or the daily
              sync hasn't gathered enough Search Console data for this site.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecommendationsPage;
