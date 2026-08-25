export interface PolicyCheckResult {
  blocked: boolean;
  reasons: string[];
}

// Deterministic keyword/regex guardrail, deliberately not a `generateObject`
// classification call — the plan allows either for MVP, and keeping this
// pure means it's instant, free, and testable without a live API key. Full
// guardrail infrastructure (duplicate-content detection, per-tenant policy
// config, auto-pause) is Phase 5; this is just the one hard-coded rule this
// phase needs so `policy_check` is a real blocking step, not a no-op.
const BANNED_CLAIMS = [
  /\bguaranteed\s+(?:results?|income|profit|cure)\b/i,
  /\b(?:cures?|treats?)\s+cancer\b/i,
  /\bno\s*risk\b/i,
];

const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN-shaped
  /\b(?:\d[ -]?){13,16}\b/, // credit-card-shaped
];

// Plain substring match, not \b-anchored: a content-policy filter should
// still catch a crude word inside a compound like "bullshit", not just the
// bare standalone word.
const PROFANITY = [/fuck/i, /shit/i];

export const runPolicyCheck = (contentMarkdown: string): PolicyCheckResult => {
  const reasons: string[] = [];

  for (const pattern of BANNED_CLAIMS) {
    if (pattern.test(contentMarkdown)) {
      reasons.push(`banned claim matched: ${pattern.source}`);
    }
  }
  for (const pattern of PII_PATTERNS) {
    if (pattern.test(contentMarkdown)) {
      reasons.push("content appears to contain PII (SSN/card-number shaped text)");
    }
  }
  for (const pattern of PROFANITY) {
    if (pattern.test(contentMarkdown)) {
      reasons.push("content contains profanity");
    }
  }

  return { blocked: reasons.length > 0, reasons };
};
