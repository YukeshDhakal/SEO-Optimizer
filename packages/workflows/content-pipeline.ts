// Phase 4: the durable version of `@repo/ai-engine`'s `runContentPipeline`
// (Phase 3), expressed as real Workflow DevKit primitives instead of a
// plain function run synchronously inside a server action. Every step that
// does real work (AI calls, DB writes) is a `"use step"` function with full
// Node.js access and automatic caching/retry; this function is purely
// orchestration — control flow, no I/O of its own — which is what the
// Workflow DevKit docs recommend to avoid the workflow sandbox's
// restrictions (no fetch/Node modules) and what actually makes a crash
// mid-pipeline resume at the unfinished step instead of restarting.
import { createHook } from "workflow";
import { validateGeoSeoOutput, type GeoSeoOutput, type PipelineStepName } from "@repo/ai-engine";
import {
  draftStep,
  geoSeoOptimizeStep,
  outlineStep,
  policyCheckStep,
  researchStep,
  topicSelectionStep,
} from "./ai-steps";
import {
  createPipelineRun,
  finalizeRunSucceeded,
  getTenantSettings,
  markRunBlocked,
  markRunFailed,
  markRunRejected,
  recordStepComplete,
  recordStepFailed,
  recordStepStart,
  type CreateRunInput,
} from "./db-steps";

const MAX_DRAFT_ATTEMPTS = 3; // initial attempt + 2 retries — same as Phase 3

const slugify = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "post";

export type ContentPipelineInput = CreateRunInput;

export interface ContentPipelineResult {
  status: "succeeded" | "blocked" | "rejected" | "failed";
  runId: string;
  postId?: string;
  reason?: string;
}

export async function contentPipelineWorkflow(
  input: ContentPipelineInput
): Promise<ContentPipelineResult> {
  "use workflow";

  const { runId } = await createPipelineRun(input);
  const settings = await getTenantSettings(input.organizationId);

  if (settings.paused) {
    // A deliberate stop, not a transient failure — retrying won't help
    // until someone unpauses the tenant, so this isn't a `RetryableError`.
    await markRunBlocked(runId, "tenant_settings.paused is true");
    return { status: "blocked", runId, reason: "This organization's content generation is paused." };
  }

  // Runs one step, bracketed by pipeline_run_steps bookkeeping — mirrors
  // Phase 3's `runStep` helper, just backed by real steps now.
  const runTrackedStep = async <T>(
    name: PipelineStepName,
    fn: () => Promise<T>
  ): Promise<T> => {
    const { stepRowId } = await recordStepStart(runId, name);
    try {
      const result = await fn();
      await recordStepComplete(stepRowId, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordStepFailed(stepRowId, message);
      throw error;
    }
  };

  const topic = await runTrackedStep("topic_selection", () =>
    topicSelectionStep({ organizationId: input.organizationId, topicHint: input.topicHint })
  );

  const researchResult = await runTrackedStep("research", () =>
    researchStep({
      organizationId: input.organizationId,
      topic: topic.topic,
      primaryKeyword: topic.primaryKeyword,
    })
  );

  const outlineResult = await runTrackedStep("outline", () =>
    outlineStep({ organizationId: input.organizationId, topic, research: researchResult })
  );

  let draftMarkdown = "";
  let feedback: string | undefined;
  let draftMeta: GeoSeoOutput | undefined;

  for (let attempt = 1; attempt <= MAX_DRAFT_ATTEMPTS; attempt++) {
    draftMarkdown = await runTrackedStep("draft", () =>
      draftStep({
        organizationId: input.organizationId,
        topic,
        outline: outlineResult,
        research: researchResult,
        feedback,
      })
    );

    let geoSeoResult: GeoSeoOutput;
    try {
      geoSeoResult = await runTrackedStep("geo_seo_optimize", () =>
        geoSeoOptimizeStep({
          organizationId: input.organizationId,
          draftMarkdown,
          research: researchResult,
        })
      );
    } catch (error) {
      if (attempt === MAX_DRAFT_ATTEMPTS) {
        // A handled, expected outcome (validation/generation never passed
        // after retrying) — return a `failed` result rather than throw, so
        // the caller (the manual-trigger server action, the cron
        // dispatcher) always gets a `runId` back to redirect to / record
        // against. Reserve actually throwing for truly unexpected errors
        // where no run exists yet at all (see `createPipelineRun` above,
        // which isn't wrapped — nothing to redirect to if that fails).
        const message = error instanceof Error ? error.message : String(error);
        await markRunFailed(runId, message);
        return { status: "failed", runId, reason: message };
      }
      feedback = error instanceof Error ? error.message : String(error);
      continue;
    }

    // Pure control-flow logic — no I/O, so it stays directly in the
    // workflow body rather than another step (see `@repo/ai-engine`'s own
    // note on why this is what keeps the retry loop testable in isolation).
    const validation = validateGeoSeoOutput(geoSeoResult, researchResult.sources.length);
    if (validation.valid) {
      draftMeta = geoSeoResult;
      break;
    }

    if (attempt === MAX_DRAFT_ATTEMPTS) {
      const message = `geo_seo_optimize validation failed: ${validation.issues.join("; ")}`;
      await markRunFailed(runId, message);
      return { status: "failed", runId, reason: message };
    }
    feedback = validation.issues.join("; ");
  }

  if (!draftMeta) {
    // Unreachable — the loop above always either `break`s with `draftMeta`
    // set or returns on its final attempt — kept only so TS's control-flow
    // analysis doesn't see `draftMeta` as possibly-undefined below.
    const message = "draft never passed validation";
    await markRunFailed(runId, message);
    return { status: "failed", runId, reason: message };
  }

  const policy = await runTrackedStep("policy_check", () => policyCheckStep(draftMarkdown));
  if (policy.blocked) {
    const reason = policy.reasons.join("; ");
    await markRunBlocked(runId, reason);
    return { status: "blocked", runId, reason };
  }

  // `approval_gate`: pauses for real (a genuine suspend/resume, not a fixed
  // timeout) when the tenant requires it. `resumeHook` is called from
  // `apps/app`'s approve/reject server action with a deterministic
  // `approval:{runId}` token. Skipped entirely — no hook created at all —
  // when approval isn't required, per the plan ("skip straight through").
  if (settings.requireApproval) {
    const { stepRowId } = await recordStepStart(runId, "approval_gate");
    const hook = createHook<{ approved: boolean }>({ token: `approval:${runId}` });
    const decision = await hook;

    if (!decision.approved) {
      await recordStepComplete(stepRowId, decision);
      await markRunRejected(runId, "rejected at approval_gate");
      return { status: "rejected", runId, reason: "Rejected by an approver." };
    }
    await recordStepComplete(stepRowId, decision);
  }

  const { postId } = await finalizeRunSucceeded({
    runId,
    organizationId: input.organizationId,
    siteConnectionId: input.siteConnectionId,
    createdBy: input.createdBy,
    title: topic.topic,
    slug: slugify(topic.topic),
    contentMarkdown: draftMarkdown,
    metaTitle: draftMeta.metaTitle,
    metaDescription: draftMeta.metaDescription,
  });

  return { status: "succeeded", runId, postId };
}
