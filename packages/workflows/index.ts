export type { GeneratedApiKey } from "./api-keys";
// Phase 10 customer MCP - pure crypto helpers with no I/O, shared by the
// dashboard server action that issues a key (apps/app) and the gateway that
// verifies one on every request (apps/api). One copy so the two can never
// disagree about the algorithm.
export { generateApiKey, hashApiKey, isApiKeyShape } from "./api-keys";
export type { QuotaCheckResult } from "./billing";
// Phase 6 billing - same "plain functions for direct server-action/route-
// handler use" reasoning as the guardrails re-export above.
export { checkQuota, currentPeriodBounds, incrementUsage } from "./billing";
export { computeNextRunAt, validateCadence } from "./cadence";
export type {
  ContentPipelineInput,
  ContentPipelineResult,
} from "./content-pipeline";
export { contentPipelineWorkflow } from "./content-pipeline";
export type {
  AuditLogEntry,
  DuplicateCheckResult,
  KillSwitchResult,
  RateLimitResult,
} from "./guardrails";
// Phase 5 guardrails - plain (non-"use step") functions, for direct use
// from a normal server action/route handler (apps/app's publish/generate
// actions, apps/api's cron dispatcher). `content-pipeline.ts` uses its own
// "use step"-wrapped versions from `./guardrail-steps` instead, since it
// runs inside a workflow sandbox.
export {
  checkDuplicateContent,
  checkKillSwitch,
  checkRateLimit,
  writeAuditLog,
} from "./guardrails";
// The keyword-volume gate's own matcher, shared with that cron so a
// recommendation and a quality gate can never disagree about what "matches".
export { fuzzyMatchKeyword, normalizeKeyword } from "./keyword-volume-check";
export type {
  RecommendationCandidate,
  ScoreIndexingProblemInput,
  ScoreKeywordGapInput,
  ScoreTitleMetaRewriteInput,
  ScoreZeroTractionInput,
} from "./recommendation-engine";
// Phase 9 recommendation engine - pure scoring functions with no I/O at all,
// consumed by apps/api's generate-content-recommendations cron, which owns
// every DB read and write around them.
export {
  scoreIndexingProblem,
  scoreKeywordGap,
  scoreTitleMetaRewrite,
  scoreZeroTraction,
} from "./recommendation-engine";
