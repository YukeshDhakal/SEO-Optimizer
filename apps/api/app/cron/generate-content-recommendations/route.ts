import { database, type Json } from "@repo/database";
import {
  fuzzyMatchKeyword,
  type RecommendationCandidate,
  scoreIndexingProblem,
  scoreKeywordGap,
  scoreTitleMetaRewrite,
  scoreZeroTraction,
} from "@repo/workflows";
import { env } from "@/env";

// Same gating posture as dispatch-runs's/sync-search-console's isAuthorized.
const isAuthorized = (request: Request): boolean => {
  if (!env.CRON_SECRET) {
    return true;
  }
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
};

type RecommendationType =
  | "title_meta_rewrite"
  | "keyword_gap"
  | "indexing_problem"
  | "zero_traction";

const RECOMMENDATION_TYPES: RecommendationType[] = [
  "title_meta_rewrite",
  "keyword_gap",
  "indexing_problem",
  "zero_traction",
];

interface ConnectedSite {
  id: string;
  organization_id: string;
}

interface PostRow {
  id: string;
  published_at: string | null;
  status: string;
  title: string;
}

interface GscQueryRow {
  ctr: number;
  impressions: number;
  position: number;
  query: string;
}

interface KeywordRow {
  avg_monthly_searches: number | null;
  keyword: string;
}

interface InspectionRow {
  coverage_state: string | null;
  index_verdict: string | null;
  last_crawl_time: string | null;
  post_id: string;
}

interface ExistingRecommendation {
  id: string;
  recommendation_type: string;
  subject_key: string;
}

const asArray = <T>(value: T[] | null): T[] =>
  Array.isArray(value) ? value : [];

// The v1 query→post association, and a known limitation: search_console_queries
// carries no page dimension (only query), so there's no authoritative
// per-page attribution available to us. This picks the highest-impression
// query whose text fuzzy-matches the post title, using the exact matcher the
// keyword-volume quality gate already uses. It's a heuristic, deliberately
// flagged rather than solved in v1.
const bestMatchingQuery = (
  postTitle: string,
  queries: GscQueryRow[]
): GscQueryRow | null => {
  let best: GscQueryRow | null = null;
  for (const row of queries) {
    if (!fuzzyMatchKeyword(row.query, postTitle)) {
      continue;
    }
    if (!best || row.impressions > best.impressions) {
      best = row;
    }
  }
  return best;
};

// Turns the already-synced caches (GSC queries, Keyword Planner volumes, URL
// Inspection verdicts) into actionable recommendations. Runs over every
// connected site rather than being gated on any one credential table: a site
// with no Ads connection should simply produce no keyword_gap rows, not be
// skipped entirely — the same fail-open-on-absent-infrastructure posture
// guardrails.ts takes.
//
// All I/O lives here; every threshold lives in @repo/workflows'
// recommendation-engine, matching how sync-search-console owns its own I/O
// around queryTopQueries.
export const GET = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: sites, error } = await database
    .from("site_connections")
    .select("id, organization_id")
    .eq("status", "connected")
    .returns<ConnectedSite[]>();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ siteConnectionId: string; action: string }> = [];

  for (const site of sites ?? []) {
    const siteConnectionId = site.id;

    try {
      const [
        { data: postRows },
        { data: queryRows },
        { data: keywordRows },
        { data: inspectionRows },
        { data: existingRows },
      ] = await Promise.all([
        database
          .from("posts")
          .select("id, title, status, published_at")
          .eq("site_connection_id", siteConnectionId)
          .returns<PostRow[]>(),
        database
          .from("search_console_queries")
          .select("query, impressions, ctr, position")
          .eq("site_connection_id", siteConnectionId)
          .returns<GscQueryRow[]>(),
        database
          .from("keyword_research")
          .select("keyword, avg_monthly_searches")
          .eq("site_connection_id", siteConnectionId)
          .returns<KeywordRow[]>(),
        database
          .from("url_inspections")
          .select("post_id, index_verdict, coverage_state, last_crawl_time")
          .eq("site_connection_id", siteConnectionId)
          .returns<InspectionRow[]>(),
        database
          .from("content_recommendations")
          .select("id, recommendation_type, subject_key")
          .eq("site_connection_id", siteConnectionId)
          .returns<ExistingRecommendation[]>(),
      ]);

      const posts = asArray(postRows);
      const queries = asArray(queryRows);
      const keywords = asArray(keywordRows);
      const inspections = asArray(inspectionRows);
      const existing = asArray(existingRows);

      const inspectionByPost = new Map(
        inspections.map((inspection) => [inspection.post_id, inspection])
      );
      const publishedPosts = posts.filter(
        (post) => post.status === "published"
      );

      // Candidates bucketed by type, because the stale-cleanup pass below
      // operates per (site_connection_id, recommendation_type) — a type that
      // produced nothing this run must still have its old rows swept.
      const candidatesByType = new Map<
        RecommendationType,
        RecommendationCandidate[]
      >(RECOMMENDATION_TYPES.map((type) => [type, []]));
      const postIdBySubjectKey = new Map<string, string>();

      const push = (
        type: RecommendationType,
        candidate: RecommendationCandidate | null,
        postId: string | null
      ): void => {
        if (!candidate) {
          return;
        }
        candidatesByType.get(type)?.push(candidate);
        if (postId) {
          postIdBySubjectKey.set(`${type}:${candidate.subjectKey}`, postId);
        }
      };

      for (const post of publishedPosts) {
        const matched = bestMatchingQuery(post.title, queries);
        const inspection = inspectionByPost.get(post.id) ?? null;

        push(
          "title_meta_rewrite",
          scoreTitleMetaRewrite({
            postId: post.id,
            postTitle: post.title,
            matchedQuery: matched
              ? {
                  query: matched.query,
                  impressions: matched.impressions,
                  ctr: matched.ctr,
                  position: matched.position,
                }
              : null,
          }),
          post.id
        );

        push(
          "indexing_problem",
          scoreIndexingProblem({
            postId: post.id,
            indexVerdict: inspection?.index_verdict ?? null,
            coverageState: inspection?.coverage_state ?? null,
            lastCrawlTime: inspection?.last_crawl_time ?? null,
          }),
          post.id
        );

        if (post.published_at) {
          push(
            "zero_traction",
            scoreZeroTraction({
              postId: post.id,
              publishedAt: post.published_at,
              indexVerdict: inspection?.index_verdict ?? null,
              matchedQuery: matched
                ? { impressions: matched.impressions }
                : null,
            }),
            post.id
          );
        }
      }

      // Keyword gaps are the one type with no post to point at — matched
      // against every post's title (not just published ones: a draft already
      // covering the topic isn't a gap either).
      for (const keywordRow of keywords) {
        const hasMatchingPost = posts.some((post) =>
          fuzzyMatchKeyword(post.title, keywordRow.keyword)
        );

        push(
          "keyword_gap",
          scoreKeywordGap({
            keyword: keywordRow.keyword,
            avgMonthlySearches: keywordRow.avg_monthly_searches,
            hasMatchingPost,
          }),
          null
        );
      }

      const now = new Date().toISOString();
      let upserted = 0;

      for (const type of RECOMMENDATION_TYPES) {
        const candidates = candidatesByType.get(type) ?? [];

        if (candidates.length > 0) {
          // Deliberately omits status/dismissed_at/actioned_at/created_at from
          // the payload: Supabase's upsert only SETs the columns it's given,
          // so a human's dismiss or mark-actioned survives every regeneration.
          // A naive delete+insert here would silently resurrect dismissed rows.
          const { error: upsertError } = await database
            .from("content_recommendations")
            .upsert(
              candidates.map((candidate) => ({
                organization_id: site.organization_id,
                site_connection_id: siteConnectionId,
                post_id:
                  postIdBySubjectKey.get(`${type}:${candidate.subjectKey}`) ??
                  null,
                recommendation_type: type,
                subject_key: candidate.subjectKey,
                title: candidate.title,
                description: candidate.description,
                priority: candidate.priority,
                metrics: candidate.metrics as Json,
                updated_at: now,
              })),
              {
                onConflict:
                  "site_connection_id,recommendation_type,subject_key",
              }
            );

          if (upsertError) {
            throw new Error(upsertError.message);
          }

          upserted += candidates.length;
        }

        // Stale cleanup: the underlying condition resolved (the post got
        // indexed, the gap got filled), so the row is noise regardless of its
        // status. Deleted by primary key rather than by a `not.in.(subject_key)`
        // filter — subject_key is a free-text keyword for keyword_gap, and
        // UUIDs never need PostgREST value quoting.
        const liveKeys = new Set(
          candidates.map((candidate) => candidate.subjectKey)
        );
        const staleIds = existing
          .filter(
            (row) =>
              row.recommendation_type === type && !liveKeys.has(row.subject_key)
          )
          .map((row) => row.id);

        if (staleIds.length > 0) {
          await database
            .from("content_recommendations")
            .delete()
            .in("id", staleIds);
        }
      }

      results.push({ siteConnectionId, action: `generated:${upserted}` });
    } catch (generateError) {
      // Per-site isolation, same as the sync crons. Nothing to mark 'error'
      // here — this route reads caches rather than talking to a third-party
      // credential, so there's no per-connection status to degrade; the
      // failure is reported in the response body and the next run retries.
      const message =
        generateError instanceof Error
          ? generateError.message
          : String(generateError);
      results.push({ siteConnectionId, action: `error:${message}` });
    }
  }

  return Response.json({ checked: sites?.length ?? 0, results });
};
