// No `server-only` guard here (or in ./steps/*): `model.ts`, the one module
// that actually touches the API key, already carries it — every step
// imports model.ts transitively, so the protection still holds when
// bundled. Keeping it off this orchestration layer is what makes it
// directly unit-testable (see __tests__/pipeline.test.ts), matching
// packages/cms-adapters' precedent of staying deliberately pure/testable.
import { marked } from "marked";
import { runPolicyCheck } from "./policy-check";
import { draft } from "./steps/draft";
import { geoSeoOptimize } from "./steps/geo-seo-optimize";
import { outline as outlineStep } from "./steps/outline";
import { research as researchStep } from "./steps/research";
import { selectTopic } from "./steps/topic-selection";
import { validateGeoSeoOutput } from "./validation";

export type PipelineStepName =
  | "topic_selection"
  | "research"
  | "outline"
  | "draft"
  | "geo_seo_optimize"
  | "policy_check";

export interface PipelineCallbacks {
  onStepStart?: (step: PipelineStepName) => void | Promise<void>;
  onStepComplete?: (
    step: PipelineStepName,
    output: unknown
  ) => void | Promise<void>;
  onStepFailed?: (
    step: PipelineStepName,
    error: unknown
  ) => void | Promise<void>;
}

export interface RunPipelineInput {
  organizationId: string;
  topicHint: string;
}

export interface PipelinePost {
  title: string;
  slug: string;
  contentMarkdown: string;
  contentHtml: string;
  metaTitle: string;
  metaDescription: string;
}

export type PipelineResult =
  | { status: "succeeded"; post: PipelinePost }
  | { status: "blocked"; reason: string }
  | { status: "failed"; error: string };

export class PipelineValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`geo_seo_optimize validation failed: ${issues.join("; ")}`);
    this.name = "PipelineValidationError";
  }
}

const MAX_DRAFT_ATTEMPTS = 3; // initial attempt + 2 retries

const slugify = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "post";

// The full manually-triggered pipeline (Phase 3). Orchestration/scheduling
// via Workflow DevKit + cron, the `approval_gate`, real `publish`, GSC
// submission, and `record_and_notify` are Phase 4/5/6/7 — this function
// stops at producing a validated draft; the caller (an apps/app server
// action) is responsible for writing `pipeline_runs`/`pipeline_run_steps`
// rows via the callbacks below and, on success, inserting the resulting
// `posts` row (mirroring how Phase 2's "Publish now" flow owns its own DB
// writes rather than the adapter doing it).
export const runContentPipeline = async (
  input: RunPipelineInput,
  callbacks: PipelineCallbacks = {}
): Promise<PipelineResult> => {
  const { onStepStart, onStepComplete, onStepFailed } = callbacks;

  const runStep = async <T>(
    name: PipelineStepName,
    fn: () => Promise<T>
  ): Promise<T> => {
    await onStepStart?.(name);
    try {
      const result = await fn();
      await onStepComplete?.(name, result);
      return result;
    } catch (error) {
      await onStepFailed?.(name, error);
      throw error;
    }
  };

  const topic = await runStep("topic_selection", () =>
    selectTopic({ organizationId: input.organizationId, topicHint: input.topicHint })
  );

  const researchResult = await runStep("research", () =>
    researchStep({
      organizationId: input.organizationId,
      topic: topic.topic,
      primaryKeyword: topic.primaryKeyword,
    })
  );

  const outlineResult = await runStep("outline", () =>
    outlineStep({
      organizationId: input.organizationId,
      topic,
      research: researchResult,
    })
  );

  let draftMarkdown = "";
  let feedback: string | undefined;
  let validationIssues: string[] = [];
  let passed = false;
  let draftMeta: Awaited<ReturnType<typeof geoSeoOptimize>> | undefined;

  for (let attempt = 1; attempt <= MAX_DRAFT_ATTEMPTS; attempt++) {
    draftMarkdown = await runStep("draft", () =>
      draft({
        organizationId: input.organizationId,
        topic,
        outline: outlineResult,
        research: researchResult,
        feedback,
      })
    );

    let geoSeoResult: Awaited<ReturnType<typeof geoSeoOptimize>>;
    try {
      geoSeoResult = await runStep("geo_seo_optimize", () =>
        geoSeoOptimize({
          organizationId: input.organizationId,
          draftMarkdown,
          research: researchResult,
        })
      );
    } catch (error) {
      if (attempt === MAX_DRAFT_ATTEMPTS) {
        throw error;
      }
      feedback = error instanceof Error ? error.message : String(error);
      continue;
    }

    const validation = validateGeoSeoOutput(
      geoSeoResult,
      researchResult.sources.length
    );

    if (validation.valid) {
      passed = true;
      validationIssues = [];
      draftMeta = geoSeoResult;
      break;
    }

    validationIssues = validation.issues;
    if (attempt === MAX_DRAFT_ATTEMPTS) {
      throw new PipelineValidationError(validation.issues);
    }
    feedback = validation.issues.join("; ");
  }

  if (!(passed && draftMeta)) {
    // Unreachable in practice — the loop above either returns via `passed`
    // or throws on the final attempt — but keeps TS's control-flow analysis
    // honest about `draftMeta` being possibly-undefined.
    throw new PipelineValidationError(
      validationIssues.length > 0
        ? validationIssues
        : ["draft never passed validation"]
    );
  }

  const policy = await runStep("policy_check", () =>
    Promise.resolve(runPolicyCheck(draftMarkdown))
  );
  if (policy.blocked) {
    return { status: "blocked", reason: policy.reasons.join("; ") };
  }

  return {
    status: "succeeded",
    post: {
      title: topic.topic,
      slug: slugify(topic.topic),
      contentMarkdown: draftMarkdown,
      contentHtml: await marked.parse(draftMarkdown),
      metaTitle: draftMeta.metaTitle,
      metaDescription: draftMeta.metaDescription,
    },
  };
};
