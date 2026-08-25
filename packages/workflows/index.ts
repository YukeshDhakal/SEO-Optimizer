export { contentPipelineWorkflow } from "./content-pipeline";
export type { ContentPipelineInput, ContentPipelineResult } from "./content-pipeline";
export { computeNextRunAt, validateCadence } from "./cadence";

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
export type {
  AuditLogEntry,
  DuplicateCheckResult,
  KillSwitchResult,
  RateLimitResult,
} from "./guardrails";
