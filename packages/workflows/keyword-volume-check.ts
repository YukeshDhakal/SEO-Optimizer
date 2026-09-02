// The 4th quality gate: cross-checks a run's target keyword against real
// search demand before it's allowed to publish. Two signals, both cached
// (never called live inside a pipeline run — see sync-keyword-research and
// sync-search-console crons): Google Ads Keyword Planner search volume
// (packages/database's `keyword_research` table) and this site's own
// Google Search Console performance (`search_console_queries`). Same tier
// as policy_check/duplicate_check in content-pipeline.ts — a hard,
// fail-closed blocker, not a pause-for-review like approval_gate.
import { database } from "@repo/database";

const MIN_MONTHLY_SEARCHES = 10;

const normalize = (value: string): string => value.trim().toLowerCase();

// Deliberately loose (case-insensitive substring containment) rather than
// exact-match: the AI-generated primaryKeyword won't always exactly match a
// cached GSC query or Keyword Planner term string.
const fuzzyMatch = (candidate: string, targetNormalized: string): boolean => {
  const candidateNormalized = normalize(candidate);
  return (
    candidateNormalized === targetNormalized ||
    candidateNormalized.includes(targetNormalized) ||
    targetNormalized.includes(candidateNormalized)
  );
};

// Exported for apps/api's generate-content-recommendations cron, which has to
// associate GSC queries and Keyword Planner terms to posts using exactly this
// matcher. Re-exported rather than reimplemented on purpose: two copies of a
// matching heuristic drift, and a recommendation that disagrees with the
// keyword-volume quality gate about what "matches" would be a real bug.
// `fuzzyMatchKeyword` normalizes both sides, unlike the internal `fuzzyMatch`
// above which expects a pre-normalized target.
export const normalizeKeyword = normalize;

export const fuzzyMatchKeyword = (candidate: string, target: string): boolean =>
  fuzzyMatch(candidate, normalize(target));

export interface KeywordVolumeCheckResult {
  blocked: boolean;
  reasons: string[];
}

interface EvaluateKeywordVolumeInput {
  avgMonthlySearches: number | null;
  hasKeywordResearchData: boolean;
  keyword: string;
  matchedGscQuery: { clicks: number; impressions: number } | null;
}

// Pure, no I/O — unit-testable in isolation, same spirit as
// validateGeoSeoOutput staying separate from the step that gathers its
// inputs (packages/ai-engine/validation.ts).
export const evaluateKeywordVolume = (
  input: EvaluateKeywordVolumeInput
): KeywordVolumeCheckResult => {
  // No Keyword Planner cache at all for this site (Ads not connected, or the
  // daily sync hasn't run yet) — best-effort guardrail, same posture as
  // checkDuplicateContent's "not configured, skip" branch: never block a run
  // over external infra this tenant hasn't set up.
  if (!input.hasKeywordResearchData) {
    return { blocked: false, reasons: [] };
  }

  const provenOnSite =
    input.matchedGscQuery !== null &&
    (input.matchedGscQuery.impressions > 0 || input.matchedGscQuery.clicks > 0);
  if (provenOnSite) {
    // Already validated by real site performance — a low/unknown Keyword
    // Planner estimate doesn't override actual traffic.
    return { blocked: false, reasons: [] };
  }

  if (
    input.avgMonthlySearches !== null &&
    input.avgMonthlySearches < MIN_MONTHLY_SEARCHES
  ) {
    return {
      blocked: true,
      reasons: [
        `"${input.keyword}" has near-zero estimated search volume (${input.avgMonthlySearches}/mo) and no existing Search Console performance for this site.`,
      ],
    };
  }

  // No matched keyword_research row (unmatched keyword despite cache
  // existing) = no affirmative bad evidence — fail open rather than block on
  // absence of data.
  return { blocked: false, reasons: [] };
};

export interface KeywordVolumeCheckStepInput {
  primaryKeyword: string;
  siteConnectionId: string;
}

// Real I/O (2 parallel DB reads) — inlined directly in the step rather than
// split into a separate step, matching topicSelectionStep's convention in
// ai-steps.ts.
export const keywordVolumeCheckStep = async (
  input: KeywordVolumeCheckStepInput
): Promise<KeywordVolumeCheckResult> => {
  "use step";

  const keywordNormalized = normalize(input.primaryKeyword);

  const [{ data: keywordRows }, { data: gscRows }] = await Promise.all([
    database
      .from("keyword_research")
      .select("keyword, avg_monthly_searches")
      .eq("site_connection_id", input.siteConnectionId),
    database
      .from("search_console_queries")
      .select("query, clicks, impressions")
      .eq("site_connection_id", input.siteConnectionId),
  ]);

  // Array.isArray guards, not just `?? []`: a plain `.select().eq(...)`
  // (no `.single()`) always resolves to an array from the real Supabase
  // client, but defend against anything unexpected here rather than let a
  // malformed response crash a quality gate.
  const keywordList = Array.isArray(keywordRows) ? keywordRows : [];
  const gscList = Array.isArray(gscRows) ? gscRows : [];

  const matchedKeywordRow = keywordList.find((row) =>
    fuzzyMatch(row.keyword, keywordNormalized)
  );
  const matchedGscRow = gscList.find((row) =>
    fuzzyMatch(row.query, keywordNormalized)
  );

  return evaluateKeywordVolume({
    keyword: input.primaryKeyword,
    avgMonthlySearches: matchedKeywordRow?.avg_monthly_searches ?? null,
    hasKeywordResearchData: keywordList.length > 0,
    matchedGscQuery: matchedGscRow
      ? { clicks: matchedGscRow.clicks, impressions: matchedGscRow.impressions }
      : null,
  });
};
