-- Phase 1: multi-tenant core — organizations, membership, site connections.
-- Later-phase tables (pipeline_runs, posts, plans, etc.) intentionally not created yet.

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan_id text,
  stripe_customer_id text,
  status text not null default 'active' check (status in ('active','past_due','suspended')),
  created_at timestamptz not null default now()
);

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text
);

create table site_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  cms_type text not null,
  base_url text,
  display_name text not null,
  status text not null default 'pending' check (status in ('pending','connected','error')),
  paused boolean not null default false,
  consecutive_publish_failures int not null default 0,
  created_at timestamptz not null default now()
);

create table cms_credentials (
  id uuid primary key default gen_random_uuid(),
  site_connection_id uuid not null references site_connections(id) on delete cascade,
  secret_ref text not null,
  created_at timestamptz not null default now()
);

create index idx_organization_members_org on organization_members(organization_id);
create index idx_organization_members_user on organization_members(user_id);
create index idx_site_connections_org on site_connections(organization_id);
create index idx_cms_credentials_site on cms_credentials(site_connection_id);

-- Helper functions (security definer, so they read organization_members
-- without re-triggering that table's own RLS policies — the standard
-- Supabase pattern for avoiding self-referential RLS recursion).

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role in ('owner','admin')
  );
$$;

create or replace function public.is_org_owner(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

create or replace function public.is_org_admin_for_site(target_site_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from site_connections
    where id = target_site_id
      and is_org_admin(organization_id)
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_org_owner(uuid) to authenticated;
grant execute on function public.is_org_admin_for_site(uuid) to authenticated;

-- Atomic org creation: bypasses the (deliberately restrictive) organization_members
-- insert policy below, since a brand-new org has no admin yet to satisfy it.
create or replace function public.create_organization_with_owner(org_name text, org_slug text)
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org organizations;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into organizations (name, slug)
  values (org_name, org_slug)
  returning * into new_org;

  insert into organization_members (organization_id, user_id, role)
  values (new_org.id, auth.uid(), 'owner');

  return new_org;
end;
$$;

grant execute on function public.create_organization_with_owner(text, text) to authenticated;

-- Auto-create a profile row when a new auth user signs up (replaces the
-- Clerk user-webhook this template used to rely on).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table user_profiles enable row level security;
alter table site_connections enable row level security;
alter table cms_credentials enable row level security;

create policy "org members can view their organization"
  on organizations for select
  using (is_org_member(id));

create policy "org admins can update their organization"
  on organizations for update
  using (is_org_admin(id))
  with check (is_org_admin(id));

create policy "org owners can delete their organization"
  on organizations for delete
  using (is_org_owner(id));

create policy "members can view fellow members of their orgs"
  on organization_members for select
  using (is_org_member(organization_id));

create policy "admins can add members"
  on organization_members for insert
  with check (is_org_admin(organization_id));

create policy "admins can update member roles"
  on organization_members for update
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

create policy "admins can remove members, members can remove themselves"
  on organization_members for delete
  using (is_org_admin(organization_id) or user_id = auth.uid());

create policy "users can view their own profile"
  on user_profiles for select
  using (auth.uid() = user_id);

create policy "users can update their own profile"
  on user_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can insert their own profile"
  on user_profiles for insert
  with check (auth.uid() = user_id);

create policy "org members can view site connections"
  on site_connections for select
  using (is_org_member(organization_id));

create policy "org admins can insert site connections"
  on site_connections for insert
  with check (is_org_admin(organization_id));

create policy "org admins can update site connections"
  on site_connections for update
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

create policy "org admins can delete site connections"
  on site_connections for delete
  using (is_org_admin(organization_id));

create policy "org admins can view cms credentials"
  on cms_credentials for select
  using (is_org_admin_for_site(site_connection_id));

create policy "org admins can insert cms credentials"
  on cms_credentials for insert
  with check (is_org_admin_for_site(site_connection_id));

create policy "org admins can update cms credentials"
  on cms_credentials for update
  using (is_org_admin_for_site(site_connection_id))
  with check (is_org_admin_for_site(site_connection_id));

create policy "org admins can delete cms credentials"
  on cms_credentials for delete
  using (is_org_admin_for_site(site_connection_id));
