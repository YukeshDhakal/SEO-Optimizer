-- Phase 7: Google Search Console integration — per-site OAuth-connected
-- property, a rolling cache of that property's top queries, and the
-- credential-storage machinery both need.

create table search_console_credentials (
  id uuid primary key default gen_random_uuid(),
  site_connection_id uuid not null unique references site_connections(id) on delete cascade,
  -- Nullable, unlike cms_credentials.secret_ref: a row can exist mid-flow
  -- (tokens saved, property not yet chosen) with secret_ref already set but
  -- gsc_site_url still null — see status='pending' below.
  secret_ref text,
  gsc_site_url text,
  status text not null default 'pending' check (status in ('pending','connected','error')),
  created_at timestamptz not null default now()
);

-- A rolling snapshot, not append-only history: each sync run deletes this
-- site's prior rows and inserts the latest fetch. This is a grounding cache
-- for topic-selection prompts, not analytics-of-record, so there's no need
-- to keep every historical period_start/period_end around.
create table search_console_queries (
  id uuid primary key default gen_random_uuid(),
  site_connection_id uuid not null references site_connections(id) on delete cascade,
  query text not null,
  clicks int not null default 0,
  impressions int not null default 0,
  ctr numeric not null default 0,
  position numeric not null default 0,
  period_start date not null,
  period_end date not null,
  fetched_at timestamptz not null default now()
);

create index idx_search_console_credentials_site on search_console_credentials(site_connection_id);
create index idx_search_console_queries_site on search_console_queries(site_connection_id);

alter table search_console_credentials enable row level security;
alter table search_console_queries enable row level security;

-- Mirrors is_org_admin_for_site (phase1) but for membership rather than
-- admin — search_console_queries is read-only data any org member should
-- be able to see (same visibility as posts), not a credential.
create or replace function public.is_org_member_for_site(target_site_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from site_connections
    where id = target_site_id
      and is_org_member(organization_id)
  );
$$;

grant execute on function public.is_org_member_for_site(uuid) to authenticated;

create policy "org admins can view search console credentials"
  on search_console_credentials for select
  using (is_org_admin_for_site(site_connection_id));

create policy "org admins can insert search console credentials"
  on search_console_credentials for insert
  with check (is_org_admin_for_site(site_connection_id));

create policy "org admins can update search console credentials"
  on search_console_credentials for update
  using (is_org_admin_for_site(site_connection_id))
  with check (is_org_admin_for_site(site_connection_id));

create policy "org admins can delete search console credentials"
  on search_console_credentials for delete
  using (is_org_admin_for_site(site_connection_id));

create policy "org members can view search console queries"
  on search_console_queries for select
  using (is_org_member_for_site(site_connection_id));

create policy "org admins can insert search console queries"
  on search_console_queries for insert
  with check (is_org_admin_for_site(site_connection_id));

create policy "org admins can update search console queries"
  on search_console_queries for update
  using (is_org_admin_for_site(site_connection_id))
  with check (is_org_admin_for_site(site_connection_id));

create policy "org admins can delete search console queries"
  on search_console_queries for delete
  using (is_org_admin_for_site(site_connection_id));

-- Interactive RPCs (mirror set_site_credentials/get_site_credentials
-- exactly): only ever called from a real user session via the RLS-respecting
-- client (the OAuth callback route, a future "recheck connection" action) —
-- gated on is_org_admin_for_site, which reads auth.uid().

create or replace function public.set_search_console_credentials(p_site_connection_id uuid, p_secret jsonb)
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
  from search_console_credentials
  where site_connection_id = p_site_connection_id;

  if existing_secret_ref is not null then
    perform vault.update_secret(existing_secret_ref::uuid, p_secret::text);

    update search_console_credentials
    set secret_ref = existing_secret_ref
    where site_connection_id = p_site_connection_id
    returning id into credentials_id;

    return credentials_id;
  end if;

  new_secret_id := vault.create_secret(p_secret::text, 'search_console:' || p_site_connection_id::text);

  insert into search_console_credentials (site_connection_id, secret_ref)
  values (p_site_connection_id, new_secret_id::text)
  on conflict (site_connection_id) do update set secret_ref = excluded.secret_ref
  returning id into credentials_id;

  return credentials_id;
end;
$$;

create or replace function public.get_search_console_credentials(p_site_connection_id uuid)
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
  from search_console_credentials
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

create or replace function public.delete_search_console_credentials(p_site_connection_id uuid)
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
  from search_console_credentials
  where site_connection_id = p_site_connection_id;

  if ref is not null then
    perform vault.delete_secret(ref::uuid);
  end if;

  delete from search_console_credentials where site_connection_id = p_site_connection_id;
end;
$$;

-- Service-role-only RPCs for the daily sync cron (apps/api/app/cron/sync-search-console).
-- The cron route runs with no acting user at all (service-role client), so
-- is_org_admin_for_site (auth.uid()-based) would always deny it — these two
-- deliberately have NO such check; safety comes entirely from the grant
-- below (service_role only), same posture as
-- 20260825140500_phase2_lock_down_credential_grants.sql's explicit
-- revoke-then-grant, just done inline here since these functions are unsafe
-- for any other role by design, not merely redundant-but-harmless.

create or replace function public.get_search_console_credentials_for_sync(p_site_connection_id uuid)
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
  from search_console_credentials
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

create or replace function public.set_search_console_credentials_for_sync(p_site_connection_id uuid, p_secret jsonb)
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
  from search_console_credentials
  where site_connection_id = p_site_connection_id;

  if existing_secret_ref is null then
    raise exception 'no search console credentials to refresh for this site connection';
  end if;

  perform vault.update_secret(existing_secret_ref::uuid, p_secret::text);

  update search_console_credentials
  set secret_ref = existing_secret_ref
  where site_connection_id = p_site_connection_id
  returning id into credentials_id;

  return credentials_id;
end;
$$;

revoke all on function public.set_search_console_credentials(uuid, jsonb) from public, anon;
revoke all on function public.get_search_console_credentials(uuid) from public, anon;
revoke all on function public.delete_search_console_credentials(uuid) from public, anon;
revoke all on function public.get_search_console_credentials_for_sync(uuid) from public, anon, authenticated;
revoke all on function public.set_search_console_credentials_for_sync(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.set_search_console_credentials(uuid, jsonb) to authenticated;
grant execute on function public.get_search_console_credentials(uuid) to authenticated;
grant execute on function public.delete_search_console_credentials(uuid) to authenticated;
grant execute on function public.get_search_console_credentials_for_sync(uuid) to service_role;
grant execute on function public.set_search_console_credentials_for_sync(uuid, jsonb) to service_role;
