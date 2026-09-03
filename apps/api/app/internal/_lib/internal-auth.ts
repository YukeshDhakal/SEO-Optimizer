import { database } from "@repo/database";
import { env } from "@/env";

// Phase B: shared by every `/internal/*` route handler. n8n's MCP Server
// Trigger workflow owns the actual MCP protocol (and its own MCP-client-facing
// bearer token); these routes are a plain internal JSON API that n8n's tool
// nodes call with `Authorization: Bearer ${N8N_INTERNAL_SECRET}`.
//
// Identical gating posture to the cron routes' own `isAuthorized()` (see
// `app/cron/dispatch-runs/route.ts` for why "not configured yet" defaults to
// allowing the request) — the one difference is the secret it checks.
//
// Deliberately one shared copy rather than the cron routes' per-file
// duplication: there are eight route files here, several of them mutating, and
// an auth gate that has to be re-typed correctly eight times is a gate that
// eventually gets missed once.
export const isAuthorized = (request: Request): boolean => {
  if (!env.N8N_INTERNAL_SECRET) {
    return true;
  }
  return (
    request.headers.get("authorization") === `Bearer ${env.N8N_INTERNAL_SECRET}`
  );
};

// The audit-log marker every mutating route in this directory writes into
// `metadata.source` (NOT `audit_log.actor` — that column is `uuid not null
// references auth.users(id)`-adjacent (`uuid`, confirmed against the live
// schema), so a literal string there would fail the insert, and
// `writeAuditLog` swallows its own errors — every MCP audit entry would
// silently vanish with no other symptom). Every write below therefore passes
// `actor: null` (the same convention `dispatch-runs` already uses for
// non-human actions) and `metadata: { source: MCP_ACTOR, ... }`, so a tenant
// reading their own audit log can still tell exactly which actions an
// external AI agent took through MCP.
export const MCP_ACTOR = "n8n_mcp";

export const unauthorized = (): Response =>
  new Response("Unauthorized", { status: 401 });

export const badRequest = (message: string): Response =>
  Response.json({ error: message }, { status: 400 });

export const notFound = (message: string): Response =>
  Response.json({ error: message }, { status: 404 });

export const conflict = (message: string, extra?: Record<string, unknown>) =>
  Response.json({ error: message, ...extra }, { status: 409 });

export const serverError = (message: string): Response =>
  Response.json({ error: message }, { status: 500 });

// These routes use the service-role `@repo/database` client, which bypasses
// RLS entirely — so `organization_id` scoping is this layer's own job, on
// every single query, exactly as PROCESS_ARCHITECTURE.md §7 requires of the
// cron/workflow paths. Unlike those paths, though, the org id here arrives as
// a caller-supplied parameter rather than being derived from a session or a
// schedule row: there is no session behind an MCP tool call. That is the
// documented trade-off of this design (see the plan's §9 scope note) and is
// why every route below re-verifies that the *entity* it is about to read or
// mutate actually belongs to the org id it was handed, instead of trusting a
// bare id.
export const readJsonBody = async (
  request: Request
): Promise<Record<string, unknown> | null> => {
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const stringField = (
  source: Record<string, unknown>,
  key: string
): string => {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
};

// Shared bounds for every list endpoint here. An MCP client is an LLM: left
// unbounded it will happily ask for everything and blow its own context (and
// this function's response size) on a large tenant.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const parseLimit = (raw: string | null): number => {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
};

export interface OrganizationContext {
  id: string;
  slug: string;
  status: string;
}

// Confirms the org exists before anything else runs. Cheap, and it turns the
// otherwise-silent "caller passed a garbage//unknown organizationId and got an
// empty list back" case into an explicit 404.
export const loadOrganization = async (
  organizationId: string
): Promise<OrganizationContext | null> => {
  const { data } = await database
    .from("organizations")
    .select("id, slug, status")
    .eq("id", organizationId)
    .maybeSingle();
  return data ?? null;
};

export interface SiteContext {
  base_url: string | null;
  cms_type: string;
  consecutive_publish_failures: number;
  id: string;
  organization_id: string;
  paused: boolean;
  status: string;
}

// Always scoped by organization_id as well as id — a caller who guesses (or
// is handed by a confused LLM) a site UUID from another tenant gets a 404, not
// that tenant's data.
export const loadSiteForOrg = async (
  siteConnectionId: string,
  organizationId: string
): Promise<SiteContext | null> => {
  const { data } = await database
    .from("site_connections")
    .select(
      "id, organization_id, cms_type, base_url, paused, status, consecutive_publish_failures"
    )
    .eq("id", siteConnectionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data ?? null;
};

// `pipeline_runs.created_by` and `schedules.created_by` are both
// `uuid not null references auth.users(id)` — there is no such row for the
// MCP connector itself, and creating a synthetic service user is a schema/auth
// change this phase explicitly does not make. So a run or schedule created
// through MCP is attributed to the organization's owner ("on whose behalf"),
// while the *audit log* records `metadata.source: "n8n_mcp"` as the thing
// that actually did it. Those two together are what make the action
// reconstructable.
//
// An explicit `createdBy` in the request body is honoured, but only after
// confirming that user really is a member of this org — otherwise an external
// caller could attribute its runs to an arbitrary UUID.
export const resolveActingUser = async (
  organizationId: string,
  requestedUserId: string
): Promise<string | null> => {
  if (requestedUserId) {
    const { data: member } = await database
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("user_id", requestedUserId)
      .maybeSingle();
    return member?.user_id ?? null;
  }

  const { data: owner } = await database
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (owner?.user_id) {
    return owner.user_id;
  }

  const { data: admin } = await database
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  return admin?.user_id ?? null;
};
