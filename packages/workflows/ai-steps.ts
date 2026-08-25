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
  type TopicSelectionInput,
} from "@repo/ai-engine";

export const topicSelectionStep = async (
  input: TopicSelectionInput
): Promise<TopicSelection> => {
  "use step";
  return selectTopic(input);
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
