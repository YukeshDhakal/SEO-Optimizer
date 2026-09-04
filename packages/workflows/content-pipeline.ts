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
import {
  validateContentGuidelines,
  validateGeoSeoOutput,
  validateSiteReference,
  type GeoSeoOutput,
} from "@repo/ai-engine";
import {
  draftStep,
  fetchResearchContextStep,
  geoSeoOptimizeStep,
  outlineStep,
  policyCheckStep,
  researchStep,
  storeResearchChunksStep,
  topicSelectionStep,
} from "./ai-steps";
import {
  createPipelineRun,
  finalizeRunSucceeded,
  getSiteIdentity,
  getTenantSettings,
  markRunBlocked,
  markRunFailed,
  markRunRejected,
  recordStepComplete,
  recordStepFailed,
  recordStepStart,
  type CreateRunInput,
  type ExtendedStepName,
} from "./db-steps";
import {
  checkDuplicateContentStep,
  checkKillSwitchStep,
  checkRateLimitStep,
  writeAuditLogStep,
} from "./guardrail-steps";
import { checkQuotaStep, incrementUsageStep } from "./billing-steps";
import { keywordVolumeCheckStep } from "./keyword-volume-check";

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

  // Backstop for anything not already handled by an inline branch below
  // (every other failure path in this function returns its own structured
  // {status:'failed'/'blocked'/'rejected', runId, reason} rather than
  // throwing) — concretely, a Workflow DevKit FatalError from a step
  // exhausting its retries. Confirmed live: 6 real runs got stuck at
  // status:'running' forever without this, because nothing between
  // topic_selection and the draft retry loop's own try/catch ever called
  // markRunFailed when a step's re-thrown error propagated past it.
  // createPipelineRun itself stays outside this try — if it fails there's
  // no runId to mark, and the caller (generatePost's own catch) already
  // handles that specific case.
  try {
    const settings = await getTenantSettings(input.organizationId);
    const site = await getSiteIdentity(input.siteConnectionId);

    // Runs one step, bracketed by pipeline_run_steps bookkeeping — mirrors
    // Phase 3's `runStep` helper, just backed by real steps now.
    const runTrackedStep = async <T>(
      name: ExtendedStepName,
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

    // Guardrails (Phase 5), checked before any AI generation happens — cheap
    // to check first, and the point of a kill switch/rate limit is not
    // starting costed work, not stopping it partway through.
    const killSwitch = await runTrackedStep("kill_switch_check", () =>
      checkKillSwitchStep(input.organizationId, input.siteConnectionId)
    );
    if (killSwitch.blocked) {
      await writeAuditLogStep({
        organizationId: input.organizationId,
        actor: input.createdBy,
        action: "run.blocked.kill_switch",
        entityType: "pipeline_run",
        entityId: runId,
        metadata: { reason: killSwitch.reason },
      });
      await markRunBlocked(
        runId,
        killSwitch.reason ?? "Blocked by kill switch."
      );
      return { status: "blocked", runId, reason: killSwitch.reason };
    }

    const rateLimit = await runTrackedStep("rate_limit_check", () =>
      checkRateLimitStep(input.organizationId)
    );
    if (rateLimit.blocked) {
      await writeAuditLogStep({
        organizationId: input.organizationId,
        actor: input.createdBy,
        action: "run.blocked.rate_limit",
        entityType: "pipeline_run",
        entityId: runId,
        metadata: { reason: rateLimit.reason },
      });
      await markRunBlocked(runId, rateLimit.reason ?? "Blocked by rate limit.");
      return { status: "blocked", runId, reason: rateLimit.reason };
    }

    // Phase 6: monthly post quota, checked alongside the Phase 5 guardrails
    // above and for the same reason - refuse before spending any AI cost,
    // not after. Applies uniformly to manual and scheduled runs (unlike
    // organizations.status = 'past_due', which the cron dispatcher alone
    // enforces - see its own comment for why that one stays scoped to
    // autonomous runs only).
    const quota = await runTrackedStep("quota_check", () =>
      checkQuotaStep(input.organizationId)
    );
    if (quota.blocked) {
      await writeAuditLogStep({
        organizationId: input.organizationId,
        actor: input.createdBy,
        action: "run.blocked.quota",
        entityType: "pipeline_run",
        entityId: runId,
        metadata: { reason: quota.reason },
      });
      await markRunBlocked(runId, quota.reason ?? "Blocked by quota.");
      return { status: "blocked", runId, reason: quota.reason };
    }

    const topic = await runTrackedStep("topic_selection", () =>
      topicSelectionStep({
        organizationId: input.organizationId,
        topicHint: input.topicHint,
        siteConnectionId: input.siteConnectionId,
      })
    );

    // Phase 11: retrieve prior research for this site before searching again,
    // and persist this run's own sources afterward - both outside
    // runTrackedStep, same convention as getSiteIdentity/getTenantSettings
    // above (knowledge-base plumbing, not a pipeline stage the run-detail UI
    // needs to surface). Neither call can fail this run: both steps are
    // best-effort internally.
    const priorContext = await fetchResearchContextStep({
      siteConnectionId: input.siteConnectionId,
      topic: topic.topic,
      primaryKeyword: topic.primaryKeyword,
    });

    const researchResult = await runTrackedStep("research", () =>
      researchStep({
        organizationId: input.organizationId,
        topic: topic.topic,
        primaryKeyword: topic.primaryKeyword,
        priorContext,
      })
    );

    await storeResearchChunksStep({
      organizationId: input.organizationId,
      siteConnectionId: input.siteConnectionId,
      sources: researchResult.sources,
    });

    const outlineResult = await runTrackedStep("outline", () =>
      outlineStep({
        organizationId: input.organizationId,
        topic,
        research: researchResult,
        contentType: input.contentType,
      })
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
          site,
          contentType: input.contentType,
        })
      );

      // Checked right here, before geo_seo_optimize, deliberately — both
      // checks below are entirely draft's own output, so a failure is
      // already knowable without spending a geo_seo_optimize model call
      // (real money, per this session's cost-minimization directive) on a
      // draft that's going to be rejected anyway. Each its own tracked step,
      // same as duplicate_check/keyword_volume_check, so they show in the
      // run detail timeline like every other gate.
      const guidelinesCheck = await runTrackedStep(
        "content_guidelines_check",
        () => Promise.resolve(validateContentGuidelines(draftMarkdown))
      );
      if (!guidelinesCheck.valid) {
        if (attempt === MAX_DRAFT_ATTEMPTS) {
          const message = `content_guidelines_check validation failed: ${guidelinesCheck.issues.join("; ")}`;
          await markRunFailed(runId, message);
          return { status: "failed", runId, reason: message };
        }
        feedback = guidelinesCheck.issues.join("; ");
        continue;
      }

      const siteCheck = await runTrackedStep("site_reference_check", () =>
        Promise.resolve(validateSiteReference(draftMarkdown, site))
      );
      if (!siteCheck.valid) {
        if (attempt === MAX_DRAFT_ATTEMPTS) {
          const message = `site_reference_check validation failed: ${siteCheck.issues.join("; ")}`;
          await markRunFailed(runId, message);
          return { status: "failed", runId, reason: message };
        }
        feedback = siteCheck.issues.join("; ");
        continue;
      }

      let geoSeoResult: GeoSeoOutput;
      try {
        geoSeoResult = await runTrackedStep("geo_seo_optimize", () =>
          geoSeoOptimizeStep({
            organizationId: input.organizationId,
            draftMarkdown,
            research: researchResult,
            outline: outlineResult,
            // Same feedback string handed to `draftStep` above — metaDescription
            // length is entirely this step's own output, invisible to and
            // uninfluenced by the draft step, so a validation failure on it
            // specifically could never self-correct across retries without
            // this (confirmed live: a real run failed 3 straight times on an
            // identical error before this fix, because this step re-ran the
            // same prompt with zero awareness it had already gotten it wrong).
            feedback,
            site,
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
          const message =
            error instanceof Error ? error.message : String(error);
          await markRunFailed(runId, message);
          return { status: "failed", runId, reason: message };
        }
        feedback = error instanceof Error ? error.message : String(error);
        continue;
      }

      // Pure control-flow logic — no I/O, so it stays directly in the
      // workflow body rather than another step (see `@repo/ai-engine`'s own
      // note on why this is what keeps the retry loop testable in isolation).
      const validation = validateGeoSeoOutput(
        geoSeoResult,
        researchResult.sources.length
      );
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

    const policy = await runTrackedStep("policy_check", () =>
      policyCheckStep(draftMarkdown)
    );
    if (policy.blocked) {
      const reason = policy.reasons.join("; ");
      await writeAuditLogStep({
        organizationId: input.organizationId,
        actor: input.createdBy,
        action: "run.blocked.policy_check",
        entityType: "pipeline_run",
        entityId: runId,
        metadata: { reason },
      });
      await markRunBlocked(runId, reason);
      return { status: "blocked", runId, reason };
    }

    // Duplicate-content check: a hard blocker, same spirit as
    // `geo_seo_optimize` — best-effort though (skips rather than blocks) when
    // no embedding provider is configured, see `guardrails.ts`.
    const duplicate = await runTrackedStep("duplicate_check", () =>
      checkDuplicateContentStep(input.siteConnectionId, draftMarkdown)
    );
    if (duplicate.duplicate) {
      const reason = duplicate.reason ?? "Too similar to an existing post.";
      await writeAuditLogStep({
        organizationId: input.organizationId,
        actor: input.createdBy,
        action: "run.blocked.duplicate_content",
        entityType: "pipeline_run",
        entityId: runId,
        metadata: { reason, similarity: duplicate.similarity },
      });
      await markRunBlocked(runId, reason);
      return { status: "blocked", runId, reason };
    }

    // Keyword-volume check: a hard blocker, same tier as duplicate_check —
    // best-effort though (never blocks) when no Keyword Planner cache exists
    // for this site yet, see keyword-volume-check.ts's evaluateKeywordVolume.
    const keywordVolume = await runTrackedStep("keyword_volume_check", () =>
      keywordVolumeCheckStep({
        siteConnectionId: input.siteConnectionId,
        primaryKeyword: topic.primaryKeyword,
      })
    );
    if (keywordVolume.blocked) {
      const reason = keywordVolume.reasons.join("; ");
      await writeAuditLogStep({
        organizationId: input.organizationId,
        actor: input.createdBy,
        action: "run.blocked.keyword_volume_check",
        entityType: "pipeline_run",
        entityId: runId,
        metadata: { reason },
      });
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
      const hook = createHook<{ approved: boolean }>({
        token: `approval:${runId}`,
      });
      const decision = await hook;

      if (!decision.approved) {
        await recordStepComplete(stepRowId, decision);
        await writeAuditLogStep({
          organizationId: input.organizationId,
          actor: input.createdBy,
          action: "approval.rejected",
          entityType: "pipeline_run",
          entityId: runId,
        });
        await markRunRejected(runId, "rejected at approval_gate");
        return {
          status: "rejected",
          runId,
          reason: "Rejected by an approver.",
        };
      }
      await recordStepComplete(stepRowId, decision);
      await writeAuditLogStep({
        organizationId: input.organizationId,
        actor: input.createdBy,
        action: "approval.granted",
        entityType: "pipeline_run",
        entityId: runId,
      });
    }

    // Re-check the kill switch one more time immediately before committing
    // the draft — closes the race where a tenant/site gets paused (or the
    // emergency stop flips) sometime during this run's several-minute AI
    // generation, after the first check at the top already passed.
    const killSwitchBeforeFinalize = await runTrackedStep(
      "kill_switch_check",
      () => checkKillSwitchStep(input.organizationId, input.siteConnectionId)
    );
    if (killSwitchBeforeFinalize.blocked) {
      await writeAuditLogStep({
        organizationId: input.organizationId,
        actor: input.createdBy,
        action: "run.blocked.kill_switch",
        entityType: "pipeline_run",
        entityId: runId,
        metadata: {
          reason: killSwitchBeforeFinalize.reason,
          stage: "pre_finalize",
        },
      });
      await markRunBlocked(
        runId,
        killSwitchBeforeFinalize.reason ?? "Blocked by kill switch."
      );
      return {
        status: "blocked",
        runId,
        reason: killSwitchBeforeFinalize.reason,
      };
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

    await writeAuditLogStep({
      organizationId: input.organizationId,
      actor: input.createdBy,
      action: "post.drafted",
      entityType: "post",
      entityId: postId,
      metadata: { pipelineRunId: runId },
    });

    // Phase 6: meter the completed run against the org's current billing
    // period, after the run has actually succeeded - a blocked/failed run
    // never reaches here and correctly doesn't count against quota.
    await incrementUsageStep(input.organizationId);

    return { status: "succeeded", runId, postId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markRunFailed(runId, message);
    return { status: "failed", runId, reason: message };
  }
}
