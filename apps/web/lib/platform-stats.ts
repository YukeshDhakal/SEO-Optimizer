import "server-only";
import { database } from "@repo/database";

export interface PlatformStats {
  postsPublished: number;
  gatePassRatePct: number | null;
}

const EMPTY_STATS: PlatformStats = { postsPublished: 0, gatePassRatePct: null };

// Real aggregate counts for the Home stats bar - replaces the design's
// placeholder numbers (12,400 posts / 88% / etc). Reads with the
// service-role client since this is a public marketing page with no
// session; only ever returns aggregate counts, never row-level data.
//
// Wrapped in try/catch because `database` (packages/database/index.ts) is a
// throwing Proxy whenever SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY aren't set
// for *this* Vercel project specifically - confirmed live that quillrun-web
// doesn't have them provisioned (only quillrun-app does; env vars are
// per-project, not shared), which took the whole homepage down with an
// unhandled server exception on first deploy. A public marketing page must
// never hard-crash over an optional stats query - degrades to the same
// honest zero/null this file already intended for a real-but-empty result.
export const getPlatformStats = async (): Promise<PlatformStats> => {
  try {
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
  } catch (error) {
    console.error("[platform-stats] falling back to empty stats:", error);
    return EMPTY_STATS;
  }
};
