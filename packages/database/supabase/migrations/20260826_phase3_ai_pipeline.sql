-- Phase 3: AI generation pipeline run tracking (manually triggered).
-- schedule_id/workflow_run_id from the full data model intentionally
-- omitted — those reference Phase 4's `schedules` table, which doesn't
-- exist yet.

create table pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_connection_id uuid not null references site_connections(id) on delete cascade,
  post_id uuid references posts(id) on delete set null,
  trigger_type text not null default 'manual' check (trigger_type in ('manual','scheduled')),
  status text not null default 'running' check (status in ('running','succeeded','failed','blocked')),
  current_step text,
  input jsonb not null default '{}',
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid not null references auth.users(id)
);

create table pipeline_run_steps (
  id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid not null references pipeline_runs(id) on delete cascade,
  step_name text not null,
  status text not null check (status in ('running','succeeded','failed','retried')),
  input jsonb,
  output jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index idx_pipeline_runs_org on pipeline_runs(organization_id);
create index idx_pipeline_runs_site on pipeline_runs(site_connection_id);
create index idx_pipeline_run_steps_run on pipeline_run_steps(pipeline_run_id);

-- Same self-recursion-avoiding security-definer pattern as
-- is_org_admin_for_site (Phase 1).
create or replace function public.is_org_member_for_pipeline_run(target_run_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from pipeline_runs
    where id = target_run_id
      and is_org_member(organization_id)
  );
$$;

create or replace function public.is_org_admin_for_pipeline_run(target_run_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from pipeline_runs
    where id = target_run_id
      and is_org_admin(organization_id)
  );
$$;

revoke all on function public.is_org_member_for_pipeline_run(uuid) from public;
revoke execute on function public.is_org_member_for_pipeline_run(uuid) from anon;
grant execute on function public.is_org_member_for_pipeline_run(uuid) to authenticated;

revoke all on function public.is_org_admin_for_pipeline_run(uuid) from public;
revoke execute on function public.is_org_admin_for_pipeline_run(uuid) from anon;
grant execute on function public.is_org_admin_for_pipeline_run(uuid) to authenticated;

alter table pipeline_runs enable row level security;
alter table pipeline_run_steps enable row level security;

-- Triggering a generation run costs real tokens/money, so this follows
-- Phase 2's posts precedent: admin-gated writes, member-readable.

create policy "org members can view pipeline runs"
  on pipeline_runs for select
  using (is_org_member(organization_id));

create policy "org admins can insert pipeline runs"
  on pipeline_runs for insert
  with check (is_org_admin(organization_id) and created_by = auth.uid());

create policy "org admins can update pipeline runs"
  on pipeline_runs for update
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

create policy "org members can view pipeline run steps"
  on pipeline_run_steps for select
  using (is_org_member_for_pipeline_run(pipeline_run_id));

create policy "org admins can insert pipeline run steps"
  on pipeline_run_steps for insert
  with check (is_org_admin_for_pipeline_run(pipeline_run_id));

create policy "org admins can update pipeline run steps"
  on pipeline_run_steps for update
  using (is_org_admin_for_pipeline_run(pipeline_run_id))
  with check (is_org_admin_for_pipeline_run(pipeline_run_id));
