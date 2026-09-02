import { database } from "@repo/database";
import type { GscTokens } from "@repo/search-console";
import { inspectUrl, refreshAccessToken } from "@repo/search-console";
import { env } from "@/env";

// Same gating posture as dispatch-runs's/sync-search-console's isAuthorized —
// see that route's comment for why "not configured yet" defaults to allowing
// the request rather than blocking it.
const isAuthorized = (request: Request): boolean => {
  if (!env.CRON_SECRET) {
    return true;
  }
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
};

// Hard cap per site per run. Google quotas URL Inspection per property per
// day, and this route is called several times a day by the n8n schedule on
// top of the Vercel daily floor — 20/site/run keeps the total cost trivial
// under every one of those triggers combined.
const POSTS_PER_SITE_LIMIT = 20;
// Re-inspect a post at most this often. A verdict doesn't change minute to
// minute, and a stale-but-recent verdict is worth far less than spending the
// quota on a post that's never been inspected at all.
const RECHECK_AFTER_DAYS = 14;

interface ConnectedRow {
  gsc_site_url: string | null;
  site_connection_id: string;
}

interface CandidatePost {
  id: string;
  published_at: string | null;
  published_url: string | null;
}

// Asks Google, per published post, what it actually thinks of that URL —
// indexed or not, and why. That verdict is the one signal in this pipeline
// that can't be inferred from performance data (a post with no impressions
// might be unindexed or merely unranked), and it's what
// generate-content-recommendations' `indexing_problem` type runs on.
//
// Per-site isolation matches sync-search-console; per-post isolation is
// stricter still (see the inner try/catch below).
export const GET = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: connected, error } = await database
    .from("search_console_credentials")
    .select("site_connection_id, gsc_site_url")
    .eq("status", "connected")
    .returns<ConnectedRow[]>();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ siteConnectionId: string; action: string }> = [];
  const recheckCutoff = new Date(
    Date.now() - RECHECK_AFTER_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  for (const row of connected ?? []) {
    const { site_connection_id: siteConnectionId, gsc_site_url: gscSiteUrl } =
      row;

    if (!gscSiteUrl) {
      // status='connected' with no property chosen shouldn't happen (the
      // callback route only sets status='connected' once it also sets
      // gsc_site_url), but skip defensively rather than throw.
      results.push({ siteConnectionId, action: "skipped:no_property" });
      continue;
    }

    try {
      const { data: secret } = await database.rpc(
        "get_search_console_credentials_for_sync",
        {
          p_site_connection_id: siteConnectionId,
        }
      );
      if (!secret) {
        results.push({ siteConnectionId, action: "skipped:no_credentials" });
        continue;
      }

      const tokens = secret as unknown as GscTokens;
      let accessToken = tokens.accessToken;

      if (Date.now() >= tokens.expiresAt) {
        const refreshed = await refreshAccessToken(tokens.refreshToken);
        accessToken = refreshed.accessToken;
        await database.rpc("set_search_console_credentials_for_sync", {
          p_site_connection_id: siteConnectionId,
          p_secret: { ...tokens, accessToken, expiresAt: refreshed.expiresAt },
        });
      }

      const { data: posts } = await database
        .from("posts")
        .select("id, published_url, published_at")
        .eq("site_connection_id", siteConnectionId)
        .eq("status", "published")
        .not("published_url", "is", null)
        .order("published_at", { ascending: true })
        .returns<CandidatePost[]>();

      const publishedPosts = (posts ?? []).filter(
        (post): post is CandidatePost & { published_url: string } =>
          typeof post.published_url === "string" &&
          post.published_url.length > 0
      );

      if (publishedPosts.length === 0) {
        results.push({
          siteConnectionId,
          action: "skipped:no_published_posts",
        });
        continue;
      }

      // Fetch existing inspection timestamps in one query rather than a
      // per-post round trip, then filter in memory: PostgREST can't express
      // "no row OR row older than X" as a single filter across the join.
      const { data: existing } = await database
        .from("url_inspections")
        .select("post_id, inspected_at")
        .eq("site_connection_id", siteConnectionId);

      const lastInspectedByPost = new Map<string, string>(
        (Array.isArray(existing) ? existing : []).map((inspection) => [
          inspection.post_id,
          inspection.inspected_at,
        ])
      );

      const candidates = publishedPosts
        .filter((post) => {
          const lastInspected = lastInspectedByPost.get(post.id);
          return !lastInspected || lastInspected < recheckCutoff;
        })
        .slice(0, POSTS_PER_SITE_LIMIT);

      if (candidates.length === 0) {
        results.push({ siteConnectionId, action: "skipped:all_fresh" });
        continue;
      }

      let inspected = 0;
      let failed = 0;

      for (const post of candidates) {
        // Per-post isolation, deliberately stricter than the per-site
        // isolation the other syncs use: one malformed/unreachable URL
        // (or a single-URL quota rejection) is not evidence the whole
        // connection is broken, so it must NOT mark the credential 'error'
        // or abort the remaining posts for this site.
        try {
          const inspection = await inspectUrl(
            accessToken,
            gscSiteUrl,
            post.published_url
          );

          await database.from("url_inspections").upsert(
            {
              site_connection_id: siteConnectionId,
              post_id: post.id,
              inspected_url: post.published_url,
              index_verdict: inspection.verdict,
              coverage_state: inspection.coverageState,
              indexing_state: inspection.indexingState,
              robots_txt_state: inspection.robotsTxtState,
              page_fetch_state: inspection.pageFetchState,
              last_crawl_time: inspection.lastCrawlTime,
              inspection_result_link: inspection.inspectionResultLink,
              inspected_at: new Date().toISOString(),
            },
            { onConflict: "post_id" }
          );

          inspected += 1;
        } catch {
          failed += 1;
        }
      }

      results.push({
        siteConnectionId,
        action: `inspected:${inspected}${failed > 0 ? `,failed:${failed}` : ""}`,
      });
    } catch (syncError) {
      // Revoked refresh token, transient Google API failure, etc. — mark
      // this connection 'error' (surfaces in the site's UI) and keep going;
      // one bad connection shouldn't abort the sweep for everyone else.
      await database
        .from("search_console_credentials")
        .update({ status: "error" })
        .eq("site_connection_id", siteConnectionId);
      const message =
        syncError instanceof Error ? syncError.message : String(syncError);
      results.push({ siteConnectionId, action: `error:${message}` });
    }
  }

  return Response.json({ checked: connected?.length ?? 0, results });
};
