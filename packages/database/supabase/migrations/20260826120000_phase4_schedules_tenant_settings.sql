-- Phase 4: schedules + tenant_settings, plus scheduling columns on pipeline_runs
create table schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_connection_id uuid not null references site_connections(id) on delete cascade,
  cadence text not null, -- cron expression, e.g. '0 9 * * 1' (Mon 9am). Validated app-side, not DB-side.
  timezone text not null default 'UTC',
  enabled boolean not null default true,
  next_run_at timestamptz,
  topic_source text not null default 'manual' check (topic_source in ('manual','auto')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_schedules_due on schedules(next_run_at) where enabled;
create index idx_schedules_org on schedules(organization_id);

create table tenant_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  require_approval boolean not null default false,
  paused boolean not null default false,
  max_posts_per_day int,
  max_posts_per_week int,
  content_policy jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table pipeline_runs
  add column schedule_id uuid references schedules(id) on delete set null,
  add column workflow_run_id text;

alter table schedules enable row level security;
alter table tenant_settings enable row level security;

-- schedules: any org member can read; owner/admin can write (mirrors site_connections' precedent)
create policy schedules_select on schedules
  for select using (is_org_member(organization_id));
create policy schedules_insert on schedules
  for insert with check (is_org_admin(organization_id));
create policy schedules_update on schedules
  for update using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));
create policy schedules_delete on schedules
  for delete using (is_org_admin(organization_id));

-- tenant_settings: any org member can read; owner/admin can write
create policy tenant_settings_select on tenant_settings
  for select using (is_org_member(organization_id));
create policy tenant_settings_insert on tenant_settings
  for insert with check (is_org_admin(organization_id));
create policy tenant_settings_update on tenant_settings
  for update using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));
