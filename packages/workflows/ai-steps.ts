// Thin "use step" wrappers around `@repo/ai-engine`'s plain step functions.
// Each one does real network I/O (Anthropic API calls) so needs a step's
// full Node.js access and gets the Workflow DevKit's automatic
// caching/retry — a crash mid-pipeline resumes at whichever step didn't
// finish rather than restarting from `topic_selection`. The functions
// themselves stay in `@repo/ai-engine`, unchanged, so Phase 3's 21 unit
// tests (and the plain-function `runContentPipeline` path they cover)
// keep working exactly as before.
import {
  draft as draftFn,
  geoSeoOptimize as geoSeoOptimizeFn,
  outline as outlineFn,
  research as researchFn,
  runPolicyCheck,
  selectTopic,
  type DraftInput,
  type GeoSeoOptimizeInput,
  type GeoSeoOutput,
  type Outline,
  type OutlineInput,
  type PolicyCheckResult,
  type ResearchInput,
  type ResearchResult,
  type TopicSelection,
} from "@repo/ai-engine";
import { database } from "@repo/database";

export interface TopicSelectionStepInput {
  organizationId: string;
  topicHint: string;
  siteConnectionId: string;
}

const MAX_GROUNDING_QUERIES = 10;

// Phase 7: reads this site's cached top Search Console queries (populated
// by apps/api's daily sync-search-console cron, empty for any site that
// hasn't connected GSC yet) and forwards them into @repo/ai-engine's
// selectTopic — which stays DB-agnostic, so the read happens here rather
// than inside ai-engine itself. Done inline in this one step (not a
// separate "use step" function) since steps in this codebase always do
// their own `database` reads directly (see db-steps.ts) rather than calling
// another step — nesting isn't part of the established pattern here.
export const topicSelectionStep = async (
  input: TopicSelectionStepInput
): Promise<TopicSelection> => {
  "use step";

  const { data: queries } = await database
    .from("search_console_queries")
    .select("query, clicks, impressions")
    .eq("site_connection_id", input.siteConnectionId)
    .order("clicks", { ascending: false })
    .limit(MAX_GROUNDING_QUERIES);

  return selectTopic({
    organizationId: input.organizationId,
    topicHint: input.topicHint,
    gscQueries: queries ?? undefined,
  });
};

export const researchStep = async (
  input: ResearchInput
): Promise<ResearchResult> => {
  "use step";
  return researchFn(input);
};

export const outlineStep = async (input: OutlineInput): Promise<Outline> => {
  "use step";
  return outlineFn(input);
};

export const draftStep = async (input: DraftInput): Promise<string> => {
  "use step";
  return draftFn(input);
};

export const geoSeoOptimizeStep = async (
  input: GeoSeoOptimizeInput
): Promise<GeoSeoOutput> => {
  "use step";
  return geoSeoOptimizeFn(input);
};

// Pure/deterministic (no I/O) but kept as a step anyway: it needs to be
// paired with `recordStepStart`/`recordStepComplete` (real DB steps) around
// it for `pipeline_run_steps` observability, and workflow-body code isn't
// allowed to call arbitrary functions from packages outside its own
// sandboxed scope reliably — running it as a step is the same pattern
// `db-steps.ts` uses and keeps every pipeline stage uniformly a step.
export const policyCheckStep = async (
  contentMarkdown: string
): Promise<PolicyCheckResult> => {
  "use step";
  return runPolicyCheck(contentMarkdown);
};
