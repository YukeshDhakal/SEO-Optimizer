// The feedback loop: turns already-cached performance data (GSC queries,
// Keyword Planner volumes, URL Inspection verdicts) into concrete, actionable
// recommendations about content that already exists.
//
// Pure, no I/O — same shape and reasoning as keyword-volume-check.ts's
// evaluateKeywordVolume: every DB read, the fuzzy query→post association and
// the upsert/delete-stale writes live in the cron route
// (apps/api/app/cron/generate-content-recommendations), so the thresholds
// themselves stay unit-testable without a route handler or a database.
//
// Every function returns null rather than throwing when the upstream signal
// it needs is missing — a site with no Ads connection, no GSC sync yet, or
// no inspection data should simply produce zero recommendations of that type,
// matching guardrails.ts's fail-open-on-absent-infrastructure posture.

export interface RecommendationCandidate {
  description: string;
  metrics: Record<string, unknown>;
  priority: "low" | "medium" | "high";
  subjectKey: string;
  title: string;
}

// A page already ranking on page 1-2 that nobody clicks is a snippet problem,
// not a ranking problem — the highest-leverage rewrite available, since the
// hard part (ranking at all) is already done.
const MIN_IMPRESSIONS_FOR_CTR_SIGNAL = 100;
const LOW_CTR_THRESHOLD = 0.02;
const MAX_POSITION_FOR_CTR_SIGNAL = 20;

export interface ScoreTitleMetaRewriteInput {
  matchedQuery: {
    query: string;
    impressions: number;
    ctr: number;
    position: number;
  } | null;
  postId: string;
  postTitle: string;
}

export const scoreTitleMetaRewrite = (
  input: ScoreTitleMetaRewriteInput
): RecommendationCandidate | null => {
  const matched = input.matchedQuery;

  // No GSC row associated with this post (no sync yet, or the fuzzy matcher
  // found nothing) — no affirmative evidence of a problem.
  if (!matched) {
    return null;
  }

  // The impressions floor is what makes the CTR meaningful: 0/3 clicks is
  // noise, 0/300 is a signal.
  if (
    matched.impressions < MIN_IMPRESSIONS_FOR_CTR_SIGNAL ||
    matched.ctr >= LOW_CTR_THRESHOLD ||
    matched.position > MAX_POSITION_FOR_CTR_SIGNAL
  ) {
    return null;
  }

  const ctrPercent = (matched.ctr * 100).toFixed(2);

  return {
    subjectKey: input.postId,
    title: `Rewrite the title and meta description for "${input.postTitle}"`,
    description: `This post ranks at position ${matched.position.toFixed(1)} for "${matched.query}" and got ${matched.impressions} impressions, but only a ${ctrPercent}% click-through rate. It's already being found — the snippet is what's losing the click.`,
    priority: "medium",
    metrics: {
      query: matched.query,
      impressions: matched.impressions,
      ctr: matched.ctr,
      position: matched.position,
    },
  };
};

// Worth writing about at all — below this, an exact-match page isn't a
// meaningful traffic opportunity even if it ranks first.
const MIN_SEARCHES_FOR_GAP = 50;

export interface ScoreKeywordGapInput {
  avgMonthlySearches: number | null;
  hasMatchingPost: boolean;
  keyword: string;
}

export const scoreKeywordGap = (
  input: ScoreKeywordGapInput
): RecommendationCandidate | null => {
  // Null volume = Keyword Planner returned no estimate for this term; absence
  // of data is not evidence of an opportunity.
  if (
    input.avgMonthlySearches === null ||
    input.avgMonthlySearches < MIN_SEARCHES_FOR_GAP
  ) {
    return null;
  }

  if (input.hasMatchingPost) {
    return null;
  }

  // Normalized keyword (not a post id) as the subject key — this is the one
  // recommendation type with no post to point at yet.
  return {
    subjectKey: input.keyword.trim().toLowerCase(),
    title: `Write about "${input.keyword}"`,
    description: `"${input.keyword}" gets roughly ${input.avgMonthlySearches} searches a month and this site has no post covering it yet.`,
    priority: "medium",
    metrics: {
      keyword: input.keyword,
      avgMonthlySearches: input.avgMonthlySearches,
    },
  };
};

const PASS_VERDICT = "PASS";

export interface ScoreIndexingProblemInput {
  coverageState: string | null;
  indexVerdict: string | null;
  lastCrawlTime: string | null;
  postId: string;
}

export const scoreIndexingProblem = (
  input: ScoreIndexingProblemInput
): RecommendationCandidate | null => {
  // Never inspected (cron hasn't reached this post yet) — not a problem, just
  // an unknown. Only an actual non-PASS verdict from Google counts.
  if (!input.indexVerdict) {
    return null;
  }

  if (input.indexVerdict === PASS_VERDICT) {
    return null;
  }

  // Highest priority of the four by a wide margin: an unindexed page earns
  // exactly zero organic traffic no matter how good it is, so this blocks
  // every other improvement to that post.
  return {
    subjectKey: input.postId,
    title: "Google can't index this published post",
    description: `Search Console reports an index verdict of "${input.indexVerdict}"${
      input.coverageState ? ` (${input.coverageState})` : ""
    } for this URL. Until that's fixed, the post can't rank for anything.`,
    priority: "high",
    metrics: {
      indexVerdict: input.indexVerdict,
      coverageState: input.coverageState,
      lastCrawlTime: input.lastCrawlTime,
    },
  };
};

// Google needs time to crawl, index and start serving a new page — flagging
// anything younger than this would just be flagging normal ramp-up.
const MIN_AGE_DAYS_FOR_ZERO_TRACTION = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ScoreZeroTractionInput {
  indexVerdict: string | null;
  matchedQuery: { impressions: number } | null;
  postId: string;
  publishedAt: string;
}

export const scoreZeroTraction = (
  input: ScoreZeroTractionInput
): RecommendationCandidate | null => {
  const publishedTime = Date.parse(input.publishedAt);
  // Unparseable/absent published_at — bail rather than compute a nonsense age.
  if (Number.isNaN(publishedTime)) {
    return null;
  }

  const ageDays = (Date.now() - publishedTime) / MS_PER_DAY;
  if (ageDays < MIN_AGE_DAYS_FOR_ZERO_TRACTION) {
    return null;
  }

  // Deliberately requires a confirmed PASS: if the post isn't indexed (or
  // hasn't been inspected yet) the real problem is indexing, and
  // scoreIndexingProblem already owns that — emitting both would be two
  // recommendations for one root cause.
  if (input.indexVerdict !== PASS_VERDICT) {
    return null;
  }

  const impressions = input.matchedQuery?.impressions ?? 0;
  if (impressions > 0) {
    return null;
  }

  return {
    subjectKey: input.postId,
    title: "Indexed for 2+ weeks with no impressions",
    description: `This post has been published and indexed for ${Math.floor(ageDays)} days but has never shown up in search results. The topic likely has no real search demand, or the content doesn't match what people actually search for.`,
    priority: "low",
    metrics: {
      ageDays: Math.floor(ageDays),
      impressions,
      indexVerdict: input.indexVerdict,
    },
  };
};
