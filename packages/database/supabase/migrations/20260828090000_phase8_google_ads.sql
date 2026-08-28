-- Phase 8: Google Ads (Keyword Planner) integration — per-site OAuth-connected
-- Ads account, a rolling cache of keyword search-volume/competition data, and
-- the credential-storage machinery both need. Mirrors
-- 20260827090000_phase7_search_console.sql's shape exactly; reuses that
-- migration's is_org_admin_for_site / is_org_member_for_site helpers as-is.

create table google_ads_credentials (
  id uuid primary key default gen_random_uuid(),
  site_connection_id uuid not null unique references site_connections(id) on delete cascade,
  -- Nullable, same reasoning as search_console_credentials.secret_ref: a row
  -- can exist mid-flow (tokens saved, account not yet chosen).
  secret_ref text,
  google_ads_customer_id text,
  status text not null default 'pending' check (status in ('pending','connected','error')),
  created_at timestamptz not null default now()
);

-- Rolling snapshot, not append-only history — same rationale as
-- search_console_queries. No period_start/period_end here: unlike GSC's
-- searchAnalytics/query, generateKeywordHistoricalMetrics returns a trailing
-- ~12-month average, not a caller-specified date range.
create table keyword_research (
  id uuid primary key default gen_random_uuid(),
  site_connection_id uuid not null references site_connections(id) on delete cascade,
  keyword text not null,
  avg_monthly_searches int,
  competition text,
  competition_index int,
  synced_at timestamptz not null default now()
);

create index idx_google_ads_credentials_site on google_ads_credentials(site_connection_id);
create index idx_keyword_research_site on keyword_research(site_connection_id);

alter table google_ads_credentials enable row level security;
alter table keyword_research enable row level security;

create policy "org admins can view google ads credentials"
  on google_ads_credentials for select
  using (is_org_admin_for_site(site_connection_id));

create policy "org admins can insert google ads credentials"
  on google_ads_credentials for insert
  with check (is_org_admin_for_site(site_connection_id));

create policy "org admins can update google ads credentials"
  on google_ads_credentials for update
  using (is_org_admin_for_site(site_connection_id))
  with check (is_org_admin_for_site(site_connection_id));

create policy "org admins can delete google ads credentials"
  on google_ads_credentials for delete
  using (is_org_admin_for_site(site_connection_id));

create policy "org members can view keyword research"
  on keyword_research for select
  using (is_org_member_for_site(site_connection_id));

create policy "org admins can insert keyword research"
  on keyword_research for insert
  with check (is_org_admin_for_site(site_connection_id));

create policy "org admins can update keyword research"
  on keyword_research for update
  using (is_org_admin_for_site(site_connection_id))
  with check (is_org_admin_for_site(site_connection_id));

create policy "org admins can delete keyword research"
  on keyword_research for delete
  using (is_org_admin_for_site(site_connection_id));

-- Interactive RPCs (mirror set_search_console_credentials/
-- get_search_console_credentials exactly): only ever called from a real user
-- session via the RLS-respecting client — gated on is_org_admin_for_site.

create or replace function public.set_google_ads_credentials(p_site_connection_id uuid, p_secret jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_secret_ref text;
  new_secret_id uuid;
  credentials_id uuid;
begin
  if not is_org_admin_for_site(p_site_connection_id) then
    raise exception 'not authorized for this site connection';
  end if;

  select secret_ref into existing_secret_ref
  from google_ads_credentials
  where site_connection_id = p_site_connection_id;

  if existing_secret_ref is not null then
    perform vault.update_secret(existing_secret_ref::uuid, p_secret::text);

    update google_ads_credentials
    set secret_ref = existing_secret_ref
    where site_connection_id = p_site_connection_id
    returning id into credentials_id;

    return credentials_id;
  end if;

  new_secret_id := vault.create_secret(p_secret::text, 'google_ads:' || p_site_connection_id::text);

  insert into google_ads_credentials (site_connection_id, secret_ref)
  values (p_site_connection_id, new_secret_id::text)
  on conflict (site_connection_id) do update set secret_ref = excluded.secret_ref
  returning id into credentials_id;

  return credentials_id;
end;
$$;

create or replace function public.get_google_ads_credentials(p_site_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ref text;
  decrypted text;
begin
  if not is_org_admin_for_site(p_site_connection_id) then
    raise exception 'not authorized for this site connection';
  end if;

  select secret_ref into ref
  from google_ads_credentials
  where site_connection_id = p_site_connection_id;

  if ref is null then
    return null;
  end if;

  select decrypted_secret into decrypted
  from vault.decrypted_secrets
  where id = ref::uuid;

  return decrypted::jsonb;
end;
$$;

create or replace function public.delete_google_ads_credentials(p_site_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ref text;
begin
  if not is_org_admin_for_site(p_site_connection_id) then
    raise exception 'not authorized for this site connection';
  end if;

  select secret_ref into ref
  from google_ads_credentials
  where site_connection_id = p_site_connection_id;

  if ref is not null then
    perform vault.delete_secret(ref::uuid);
  end if;

  delete from google_ads_credentials where site_connection_id = p_site_connection_id;
end;
$$;

-- Service-role-only RPCs for the daily sync cron
-- (apps/api/app/cron/sync-keyword-research). No is_org_admin_for_site check
-- by design (the cron runs with no acting user, auth.uid() would always
-- deny it) — safety comes entirely from the grant below (service_role only).

create or replace function public.get_google_ads_credentials_for_sync(p_site_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ref text;
  decrypted text;
begin
  select secret_ref into ref
  from google_ads_credentials
  where site_connection_id = p_site_connection_id;

  if ref is null then
    return null;
  end if;

  select decrypted_secret into decrypted
  from vault.decrypted_secrets
  where id = ref::uuid;

  return decrypted::jsonb;
end;
$$;

create or replace function public.set_google_ads_credentials_for_sync(p_site_connection_id uuid, p_secret jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_secret_ref text;
  credentials_id uuid;
begin
  select secret_ref into existing_secret_ref
  from google_ads_credentials
  where site_connection_id = p_site_connection_id;

  if existing_secret_ref is null then
    raise exception 'no google ads credentials to refresh for this site connection';
  end if;

  perform vault.update_secret(existing_secret_ref::uuid, p_secret::text);

  update google_ads_credentials
  set secret_ref = existing_secret_ref
  where site_connection_id = p_site_connection_id
  returning id into credentials_id;

  return credentials_id;
end;
$$;

revoke all on function public.set_google_ads_credentials(uuid, jsonb) from public, anon;
revoke all on function public.get_google_ads_credentials(uuid) from public, anon;
revoke all on function public.delete_google_ads_credentials(uuid) from public, anon;
revoke all on function public.get_google_ads_credentials_for_sync(uuid) from public, anon, authenticated;
revoke all on function public.set_google_ads_credentials_for_sync(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.set_google_ads_credentials(uuid, jsonb) to authenticated;
grant execute on function public.get_google_ads_credentials(uuid) to authenticated;
grant execute on function public.delete_google_ads_credentials(uuid) to authenticated;
grant execute on function public.get_google_ads_credentials_for_sync(uuid) to service_role;
grant execute on function public.set_google_ads_credentials_for_sync(uuid, jsonb) to service_role;
