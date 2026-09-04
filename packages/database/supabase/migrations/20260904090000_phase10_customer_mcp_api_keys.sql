-- Phase 10: customer-facing multi-tenant MCP server — per-tenant API keys and
-- the per-key call counter that bounds their cost exposure.
--
-- Phase B's `/internal/*` routes are gated by one shared N8N_INTERNAL_SECRET
-- and take `organizationId` as a caller-supplied parameter. That is fine for
-- the operator's own n8n automation (one holder, one secret) but cannot be
-- opened to customers: any holder could name any org. These tables back a
-- separate gateway (`apps/api/app/mcp`) where the org is resolved server-side
-- from the presented key and never read from the request.

-- API keys are stored as a sha-256 hash, not in Vault. Vault is for secrets
-- this system has to decrypt *back* (CMS credentials, OAuth tokens); an API
-- key only ever needs one-way comparison against a presented value, so a plain
-- hash column is both sufficient and the safer default — a database dump
-- leaks nothing usable. `key_prefix` is the first 12 plaintext characters,
-- kept so the dashboard can identify a key in a list without ever storing or
-- re-displaying the secret.
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  created_by uuid not null references auth.users(id),
  -- Cost-exposure cap — null means unlimited. Set at creation time, editable
  -- later; enforced by the gateway before any tool dispatch.
  monthly_call_limit int,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_api_keys_org on api_keys(organization_id);
create unique index idx_api_keys_key_hash on api_keys(key_hash);

alter table api_keys enable row level security;

-- Member-read/admin-write, the same split every org-scoped table in this
-- schema uses. Note the select policy governs the dashboard only: the gateway
-- authenticates keys through the service-role client, which bypasses RLS —
-- and must, since an MCP request carries no Supabase session at all.
create policy api_keys_select on api_keys for select
  using (is_org_member(organization_id));
create policy api_keys_insert on api_keys for insert
  with check (is_org_admin(organization_id));
create policy api_keys_update on api_keys for update
  using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));
-- No delete policy: revocation is an update (revoked_at), not a delete. A
-- revoked key's row has to survive so the audit trail it produced stays
-- attributable.

-- Per-key call counter, same shape/reset cadence as the existing
-- usage_counters/incrementUsage() pattern in packages/workflows/billing.ts —
-- this is the MCP-specific analogue of n8n's own "459/1000 Executions" bar.
-- Counts EVERY gateway request (reads included), unlike usage_counters'
-- posts_generated, which only counts successful generations.
create table mcp_usage_counters (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references api_keys(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  calls_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (api_key_id, period_start)
);

create index idx_mcp_usage_counters_org on mcp_usage_counters(organization_id);

alter table mcp_usage_counters enable row level security;

create policy mcp_usage_counters_select on mcp_usage_counters for select
  using (is_org_member(organization_id));
-- No insert/update policy: only the gateway (service-role client, bypasses
-- RLS) writes this table, same posture as usage_counters today.
