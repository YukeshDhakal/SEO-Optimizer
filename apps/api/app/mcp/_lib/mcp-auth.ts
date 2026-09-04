import { database } from "@repo/database";
import {
  currentPeriodBounds,
  hashApiKey,
  isApiKeyShape,
} from "@repo/workflows";

// Phase 10: authentication for the customer-facing MCP gateway.
//
// This is the whole trust boundary between an arbitrary customer's AI client
// and a live tenant's data. The single most important property it has is that
// `organizationId` comes out of the `api_keys` row and nowhere else — never
// from a header, a query parameter, or a tool argument. An LLM on the other end
// of this connection can be persuaded to send anything; it cannot be persuaded
// to change which row its key hashes to.
//
// Deliberately separate from `/internal/_lib/internal-auth.ts`'s `isAuthorized`
// rather than an extension of it: that gate checks one shared secret with no
// notion of tenancy at all, which is exactly why it can't be opened to
// customers. Keeping the two apart means a change to one can't quietly relax
// the other.

export interface ApiKeyContext {
  apiKeyId: string;
  createdBy: string;
  organizationId: string;
}

export interface ApiKeyBlocked {
  blocked: string;
}

export type ApiKeyAuthResult = ApiKeyBlocked | ApiKeyContext | null;

export const isBlocked = (result: ApiKeyAuthResult): result is ApiKeyBlocked =>
  result !== null && "blocked" in result;

interface ApiKeyRow {
  created_by: string;
  id: string;
  monthly_call_limit: number | null;
  organization_id: string;
  revoked_at: string | null;
}

// Best-effort, exactly like `writeAuditLog`: a failure to record when a key was
// last used is a cosmetic problem on a dashboard, and must never be the reason
// a customer's tool call fails.
const touchLastUsed = async (apiKeyId: string): Promise<void> => {
  try {
    await database
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", apiKeyId);
  } catch {
    // Intentionally swallowed.
  }
};

// Check-and-increment against the current calendar month, mirroring
// `incrementUsage()`'s read-then-update-or-insert shape from
// `packages/workflows/billing.ts` (and `currentPeriodBounds()` is literally the
// same function, so an MCP period and a billing period can never drift apart).
//
// Counts every request, reads included — a read tool called in a loop is the
// cost-exposure case this exists to bound, and it is the one `usage_counters`
// deliberately does not count.
//
// This is not transactional: two concurrent requests from the same key can both
// read the same count and both increment past the cap by one. That is a known
// and accepted imprecision — the cap is a cost bound, not a billing ledger, and
// the failure mode is "one extra call got through", not "the cap stopped
// working". Making it exact would need a Postgres function and a round trip
// this hot path can't justify.
const checkAndIncrementUsage = async (
  key: ApiKeyRow
): Promise<string | null> => {
  const { periodStart, periodEnd } = currentPeriodBounds();

  const { data: existing } = await database
    .from("mcp_usage_counters")
    .select("id, calls_count")
    .eq("api_key_id", key.id)
    .eq("period_start", periodStart.toISOString())
    .maybeSingle();

  const used = existing?.calls_count ?? 0;

  // Checked *before* the increment, so the request that would have been number
  // (limit + 1) is refused rather than counted. A null limit means unlimited
  // and skips the comparison entirely — but still records the call, so the
  // dashboard can show usage for an uncapped key.
  if (key.monthly_call_limit !== null && used >= key.monthly_call_limit) {
    return `Monthly call limit reached for this API key (${used}/${key.monthly_call_limit}). It resets at the start of next month, or an organization admin can raise the limit in Quillrun under Guardrails → API keys.`;
  }

  if (existing) {
    await database
      .from("mcp_usage_counters")
      .update({ calls_count: used + 1 })
      .eq("id", existing.id);
  } else {
    await database.from("mcp_usage_counters").insert({
      api_key_id: key.id,
      organization_id: key.organization_id,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      calls_count: 1,
    });
  }

  return null;
};

/**
 * Resolves the presented bearer token to the organization it belongs to.
 *
 * Returns `null` for anything that isn't a usable key (absent, malformed,
 * unknown, or revoked), a `{ blocked }` object when the key is real but has
 * exhausted its monthly call limit, and the resolved context otherwise.
 *
 * Every `null` case is deliberately indistinguishable to the caller: an
 * attacker probing this endpoint must not be able to tell "no such key" from
 * "revoked key", because that difference is an oracle for whether a leaked key
 * was ever valid.
 */
export const authenticateApiKey = async (
  request: Request
): Promise<ApiKeyAuthResult> => {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }

  const presented = header.slice("Bearer ".length).trim();

  // Structural check first, so a garbage header costs no database round trip.
  if (!isApiKeyShape(presented)) {
    return null;
  }

  // Looked up by hash, never by prefix: the query itself never carries anything
  // that could be replayed, and `idx_api_keys_key_hash` makes it a single index
  // hit. The service-role client is required here — an MCP request has no
  // Supabase session, so there is no RLS context to scope by; that is precisely
  // why the org is taken from the row rather than trusted from the request.
  const { data: key } = await database
    .from("api_keys")
    .select("id, organization_id, created_by, monthly_call_limit, revoked_at")
    .eq("key_hash", hashApiKey(presented))
    .maybeSingle<ApiKeyRow>();

  if (!key || key.revoked_at) {
    return null;
  }

  const blocked = await checkAndIncrementUsage(key);
  if (blocked) {
    return { blocked };
  }

  await touchLastUsed(key.id);

  return {
    apiKeyId: key.id,
    createdBy: key.created_by,
    organizationId: key.organization_id,
  };
};
