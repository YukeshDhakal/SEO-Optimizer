// "use step" wrappers around `guardrails.ts`'s plain functions, for use
// inside `content-pipeline.ts`'s `"use workflow"` body - same pattern
// `ai-steps.ts`/`db-steps.ts` use, so every piece of real I/O inside the
// workflow (network, DB) stays in a step, never the sandboxed workflow
// body itself.
import {
  checkDuplicateContent as checkDuplicateContentFn,
  checkKillSwitch as checkKillSwitchFn,
  checkRateLimit as checkRateLimitFn,
  writeAuditLog as writeAuditLogFn,
  type AuditLogEntry,
  type DuplicateCheckResult,
  type KillSwitchResult,
  type RateLimitResult,
} from "./guardrails";

export const checkKillSwitchStep = async (
  organizationId: string,
  siteConnectionId: string
): Promise<KillSwitchResult> => {
  "use step";
  return checkKillSwitchFn(organizationId, siteConnectionId);
};

export const checkRateLimitStep = async (organizationId: string): Promise<RateLimitResult> => {
  "use step";
  return checkRateLimitFn(organizationId);
};

export const checkDuplicateContentStep = async (
  siteConnectionId: string,
  contentMarkdown: string
): Promise<DuplicateCheckResult> => {
  "use step";
  return checkDuplicateContentFn(siteConnectionId, contentMarkdown);
};

export const writeAuditLogStep = async (entry: AuditLogEntry): Promise<void> => {
  "use step";
  return writeAuditLogFn(entry);
};
