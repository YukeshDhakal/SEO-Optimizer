// Deliberately no `import "server-only"` guard here — same reasoning as
// `@repo/ai-engine/pipeline.ts`: this module is meant to be directly
// unit-testable (see `__tests__/guardrails.test.ts`), and the guard would
// throw outside a Next.js RSC build the moment vitest imports it. Server-
// only protection still holds transitively: `@repo/database`'s `index.ts`
// carries the guard itself, and `generateEmbedding` (`@repo/ai-engine`)
// touches its provider client the same way `model.ts` does.
import { generateEmbedding } from "@repo/ai-engine";
import { database } from "@repo/database";
import type { Json } from "@repo/database";

// Plain async functions - callable directly from a normal server
// action/route handler (apps/app's publish/generate actions, apps/api's
// cron dispatcher), all of which already run outside any workflow
// sandbox. `guardrail-steps.ts` wraps these with "use step" for the one
// place that *does* need it: inside `content-pipeline.ts`'s `"use
// workflow"` body.

// A single, env-var-backed, system-wide switch - deliberately not a DB
// flag. It needs to keep working even if the DB/RLS layer itself is what's
// misbehaving (a bad migration, a leaked service-role key being abused,
// Supabase itself down) - a platform operator flips this in the hosting
// provider's env var UI and every autonomous action stops on the next
// request, with no DB round-trip required to take effect. Per-tenant
// pausing (tenant_settings.paused) stays DB-backed since that's a
// tenant-scoped, self-service control with no such bootstrap concern.
const isEmergencyStopped = () => process.env.EMERGENCY_STOP === "true";

export interface KillSwitchResult {
  blocked: boolean;
  reason?: string;
}

// Re-checked immediately before any autonomous action commits (starting a
// pipeline run, and separately right before an actual publish call) -
// closes the race where a tenant/site gets paused, or the emergency stop
// flips, after an earlier check already passed.
export const checkKillSwitch = async (
  organizationId: string,
  siteConnectionId: string
): Promise<KillSwitchResult> => {
  if (isEmergencyStopped()) {
    return { blocked: true, reason: "Platform-wide emergency stop is active." };
  }

  const [{ data: settings }, { data: site }] = await Promise.all([
    database
      .from("tenant_settings")
      .select("paused")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    database
      .from("site_connections")
      .select("paused")
      .eq("id", siteConnectionId)
      .maybeSingle(),
  ]);

  if (settings?.paused) {
    return { blocked: true, reason: "This organization's content generation is paused." };
  }
  if (site?.paused) {
    return {
      blocked: true,
      reason: "This site is paused (may be an automatic pause after repeated publish failures).",
    };
  }
  return { blocked: false };
};

export interface RateLimitResult {
  blocked: boolean;
  reason?: string;
}

const startOfUtcDay = (from: Date): Date => {
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const startOfUtcWeek = (from: Date): Date => {
  const d = startOfUtcDay(from);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
};

// Counts rows in `posts` (drafted or published - post creation is the
// costed action, not just the publish step) rather than routing through
// `packages/rate-limit` (Upstash-backed) - that package needs
// UPSTASH_REDIS_REST_URL/TOKEN, external credentials not available in this
// environment, same class of problem as the missing Supabase/Anthropic
// keys. A direct count query is simpler, needs no new external service,
// and is correct at this app's actual scale.
export const checkRateLimit = async (organizationId: string): Promise<RateLimitResult> => {
  const { data: settings } = await database
    .from("tenant_settings")
    .select("max_posts_per_day, max_posts_per_week")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!(settings?.max_posts_per_day || settings?.max_posts_per_week)) {
    return { blocked: false };
  }

  const now = new Date();

  if (settings.max_posts_per_day) {
    const { count } = await database
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfUtcDay(now).toISOString());

    if ((count ?? 0) >= settings.max_posts_per_day) {
      return { blocked: true, reason: `Daily post limit reached (${settings.max_posts_per_day}/day).` };
    }
  }

  if (settings.max_posts_per_week) {
    const { count } = await database
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfUtcWeek(now).toISOString());

    if ((count ?? 0) >= settings.max_posts_per_week) {
      return { blocked: true, reason: `Weekly post limit reached (${settings.max_posts_per_week}/week).` };
    }
  }

  return { blocked: false };
};

export interface DuplicateCheckResult {
  duplicate: boolean;
  reason?: string;
  similarity?: number;
}

// Cosine similarity - conservative on purpose: high enough to catch a
// near-verbatim rewrite of an existing post (the actual failure mode this
// guards against - an under-specified topic hint producing the same
// article twice) without flagging two merely-related posts on the same
// broad subject, which is normal and desired for a content calendar.
const DUPLICATE_SIMILARITY_THRESHOLD = 0.92;

export const checkDuplicateContent = async (
  siteConnectionId: string,
  contentMarkdown: string
): Promise<DuplicateCheckResult> => {
  const embedding = await generateEmbedding(contentMarkdown);
  if (!embedding) {
    // Not configured (no OPENAI_API_KEY) or the provider call failed -
    // best-effort guardrail, skip rather than block an otherwise-valid run
    // over infrastructure this environment doesn't have configured.
    return { duplicate: false };
  }

  const { data, error } = await database.rpc("find_similar_posts", {
    p_site_connection_id: siteConnectionId,
    p_embedding: embedding as unknown as string,
    p_threshold: DUPLICATE_SIMILARITY_THRESHOLD,
    p_limit: 1,
  });

  if (error || !data || data.length === 0) {
    return { duplicate: false };
  }

  const [match] = data;
  return {
    duplicate: true,
    similarity: match.similarity ?? undefined,
    reason: `Too similar to an existing post ("${match.title}", ${(
      (match.similarity ?? 0) * 100
    ).toFixed(1)}% similar).`,
  };
};

export interface AuditLogEntry {
  organizationId: string;
  actor: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

// Best-effort: a logging failure must never break the guardrail action it
// describes (e.g. don't fail a legitimate kill-switch block because the
// audit insert itself failed for some unrelated reason).
export const writeAuditLog = async (entry: AuditLogEntry): Promise<void> => {
  try {
    await database.from("audit_log").insert({
      organization_id: entry.organizationId,
      actor: entry.actor,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      metadata: (entry.metadata ?? {}) as Json,
    });
  } catch {
    // swallow - see comment above
  }
};
