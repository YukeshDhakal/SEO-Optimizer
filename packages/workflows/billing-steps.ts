// "use step" wrappers around `billing.ts`'s plain functions, for use inside
// `content-pipeline.ts`'s `"use workflow"` body - same pattern
// `guardrail-steps.ts` uses.
import { checkQuota as checkQuotaFn, incrementUsage as incrementUsageFn, type QuotaCheckResult } from "./billing";

export const checkQuotaStep = async (organizationId: string): Promise<QuotaCheckResult> => {
  "use step";
  return checkQuotaFn(organizationId);
};

export const incrementUsageStep = async (organizationId: string): Promise<void> => {
  "use step";
  return incrementUsageFn(organizationId);
};
