// Phase 6 billing: usage metering and quota enforcement. Deliberately
// separate from `guardrails.ts` (Phase 5) even though the shape is
// similar - these are billing-period concerns tied to `subscriptions`/
// `plans`, not the short-window safety guardrails that already existed.
// No `import "server-only"` guard here either, same reasoning as
// `guardrails.ts`: kept directly unit-testable.
import { database } from "@repo/database";

// Billing period = calendar month in UTC. Simpler and more predictable
// than "30 days since signup" per-org rolling windows, and matches how a
// Stripe subscription's `current_period_*` will typically align once real
// billing is wired up (monthly plans). `usage_counters` has a unique
// constraint on (organization_id, period_start), so this is also what
// makes "the current period's row" a well-defined single row to
// upsert against.
export const currentPeriodBounds = (
  from: Date = new Date()
): { periodStart: Date; periodEnd: Date } => {
  const periodStart = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd };
};

export interface QuotaCheckResult {
  blocked: boolean;
  reason?: string;
}

// Checked before any AI generation starts (alongside the Phase 5 kill
// switch/rate limit checks) - the whole point of a quota is not starting
// costed work once it's exhausted, not stopping it partway through. An
// org with no `subscriptions` row yet (hasn't chosen a plan) is treated as
// unlimited rather than blocked - forcing every brand-new org through a
// paywall before their first post, with no real Stripe account wired up
// anywhere in this environment to actually complete a checkout, would make
// the whole app untestable end-to-end. Revisit once Phase 6's checkout
// flow is live and "no subscription" can mean something the user actually
// chose, not just "hasn't been asked yet."
export const checkQuota = async (organizationId: string): Promise<QuotaCheckResult> => {
  const { data: subscription } = await database
    .from("subscriptions")
    .select("plan_id, status")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!subscription?.plan_id) {
    return { blocked: false };
  }

  const { data: plan } = await database
    .from("plans")
    .select("name, monthly_post_quota")
    .eq("id", subscription.plan_id)
    .maybeSingle();

  if (!plan) {
    return { blocked: false };
  }

  const { periodStart } = currentPeriodBounds();
  const { data: usage } = await database
    .from("usage_counters")
    .select("posts_generated")
    .eq("organization_id", organizationId)
    .eq("period_start", periodStart.toISOString())
    .maybeSingle();

  const used = usage?.posts_generated ?? 0;
  if (used >= plan.monthly_post_quota) {
    return {
      blocked: true,
      reason: `Monthly post quota reached (${used}/${plan.monthly_post_quota} on the ${plan.name} plan).`,
    };
  }
  return { blocked: false };
};

// Incremented once per successfully-drafted post (the AI-generation step
// that actually costs money), on `contentPipelineWorkflow`'s finalize
// path - not on manual "Publish now" (Phase 2), which involves no AI call
// at all and isn't what a post quota is metering.
//
// `ai_tokens_used`/`ai_cost_usd` stay at their default (0) here rather than
// being backfilled with a fabricated number - `@repo/ai-engine`'s step
// functions (topicSelectionStep, researchStep, outlineStep, draftStep,
// geoSeoOptimizeStep) return only their parsed result today, not the AI
// SDK's per-call `usage` object, and threading that through five
// already-tested Phase 3 function signatures is a bigger, riskier change
// than this phase's scope - especially given the instruction not to
// regress Phase 3's 21 passing tests. The columns exist and are ready for
// that wiring later; `posts_generated` is what quota enforcement actually
// needs today and is accurate.
export const incrementUsage = async (organizationId: string): Promise<void> => {
  const { periodStart, periodEnd } = currentPeriodBounds();

  const { data: existing } = await database
    .from("usage_counters")
    .select("id, posts_generated")
    .eq("organization_id", organizationId)
    .eq("period_start", periodStart.toISOString())
    .maybeSingle();

  if (existing) {
    await database
      .from("usage_counters")
      .update({ posts_generated: existing.posts_generated + 1 })
      .eq("id", existing.id);
    return;
  }

  await database.from("usage_counters").insert({
    organization_id: organizationId,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    posts_generated: 1,
  });
};
