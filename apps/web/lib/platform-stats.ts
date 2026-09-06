import "server-only";
import { database } from "@repo/database";

export interface PlatformStats {
  postsPublished: number;
  gatePassRatePct: number | null;
}

// Real aggregate counts for the Home stats bar - replaces the design's
// placeholder numbers (12,400 posts / 88% / etc). Reads with the
// service-role client since this is a public marketing page with no
// session; only ever returns aggregate counts, never row-level data.
// Degrades to an honest zero/null on query failure rather than a fabricated
// fallback number - a real "0" is more truthful than a fake "12,400" here.
export const getPlatformStats = async (): Promise<PlatformStats> => {
  const [{ count: postsPublished }, { count: succeeded }, { count: finished }] =
    await Promise.all([
      database
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
      database
        .from("pipeline_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "succeeded"),
      database
        .from("pipeline_runs")
        .select("id", { count: "exact", head: true })
        .in("status", ["succeeded", "failed", "blocked", "rejected"]),
    ]);

  return {
    postsPublished: postsPublished ?? 0,
    gatePassRatePct:
      finished && finished > 0
        ? Math.round(((succeeded ?? 0) / finished) * 100)
        : null,
  };
};
