// No `server-only` guard here (or in ./steps/*): `model.ts`, the one module
// that actually touches the API key, already carries it — every step
// imports model.ts transitively, so the protection still holds when
// bundled. Keeping it off this orchestration layer is what makes it
// directly unit-testable (see __tests__/pipeline.test.ts), matching
// packages/cms-adapters' precedent of staying deliberately pure/testable.
import { marked } from "marked";
import type { ContentType } from "./content-guidelines";
import { runPolicyCheck } from "./policy-check";
import type { SiteIdentity } from "./schemas";
import { draft } from "./steps/draft";
import { geoSeoOptimize } from "./steps/geo-seo-optimize";
import { outline as outlineStep } from "./steps/outline";
import { research as researchStep } from "./steps/research";
import { selectTopic } from "./steps/topic-selection";
import {
  validateContentGuidelines,
  validateGeoSeoOutput,
  validateSiteReference,
} from "./validation";

export type PipelineStepName =
  | "topic_selection"
  | "research"
  | "outline"
  | "draft"
  | "content_guidelines_check"
  | "site_reference_check"
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
  // The site this post is being written for — optional so existing callers
  // (and this file's own pre-existing tests) that predate this field keep
  // working; when omitted, the site-reference-back requirement is simply
  // never checked. See `PipelineValidationError` and `validateSiteReference`
  // (validation.ts) for the actual enforcement.
  site?: SiteIdentity;
  // "blog" (default) or "faq" — threaded into both outline and draft so
  // their structure/prompt guidance stays consistent with each other. See
  // content-guidelines.ts.
  contentType?: ContentType;
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
  constructor(readonly issues: string[], stage = "geo_seo_optimize") {
    super(`${stage} validation failed: ${issues.join("; ")}`);
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
      contentType: input.contentType,
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
        site: input.site,
        contentType: input.contentType,
      })
    );

    // Checked right here, before geo_seo_optimize, deliberately — both
    // checks below are entirely draft's own output, so a failure is
    // already knowable without spending a geo_seo_optimize model call on a
    // draft that's going to be rejected anyway.
    const guidelinesCheck = await runStep("content_guidelines_check", () =>
      Promise.resolve(validateContentGuidelines(draftMarkdown))
    );
    if (!guidelinesCheck.valid) {
      validationIssues = guidelinesCheck.issues;
      if (attempt === MAX_DRAFT_ATTEMPTS) {
        throw new PipelineValidationError(guidelinesCheck.issues, "content_guidelines_check");
      }
      feedback = guidelinesCheck.issues.join("; ");
      continue;
    }

    // Only runs when a site was actually given (existing callers/tests
    // that omit it are unaffected).
    if (input.site) {
      const siteCheck = await runStep("site_reference_check", () =>
        Promise.resolve(validateSiteReference(draftMarkdown, input.site as SiteIdentity))
      );
      if (!siteCheck.valid) {
        validationIssues = siteCheck.issues;
        if (attempt === MAX_DRAFT_ATTEMPTS) {
          throw new PipelineValidationError(siteCheck.issues, "site_reference_check");
        }
        feedback = siteCheck.issues.join("; ");
        continue;
      }
    }

    let geoSeoResult: Awaited<ReturnType<typeof geoSeoOptimize>>;
    try {
      geoSeoResult = await runStep("geo_seo_optimize", () =>
        geoSeoOptimize({
          organizationId: input.organizationId,
          draftMarkdown,
          research: researchResult,
          outline: outlineResult,
          // Same feedback string handed to `draft` above — metaDescription
          // length is entirely this step's own output, so without this a
          // validation failure on it specifically could never self-correct
          // across retries (see GeoSeoOptimizeInput.feedback's own comment
          // for why).
          feedback,
          site: input.site,
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
