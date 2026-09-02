-- Phase 9: SEO recommendation engine — Google's own indexed view of each
-- published URL (URL Inspection API cache) plus the actionable
-- recommendations derived from it alongside the already-synced GSC/Ads
-- performance caches.

-- Cache of the Search Console URL Inspection API's verdict per published
-- post. Deliberately upsert-on-post_id rather than the delete+insert
-- rolling-snapshot pattern search_console_queries uses: the sync cron only
-- checks a bounded subset of posts per run (Google quotas a property's
-- daily inspections), so a wholesale replace would destroy the verdict for
-- every post that happened not to be rechecked this run.
create table url_inspections (
  id uuid primary key default gen_random_uuid(),
  site_connection_id uuid not null references site_connections(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  inspected_url text not null,
  index_verdict text,
  coverage_state text,
  indexing_state text,
  robots_txt_state text,
  page_fetch_state text,
  last_crawl_time timestamptz,
  inspection_result_link text,
  inspected_at timestamptz not null default now()
);

create unique index idx_url_inspections_post on url_inspections(post_id);
create index idx_url_inspections_site on url_inspections(site_connection_id);

alter table url_inspections enable row level security;

-- Same helpers (and same member-read/admin-write split) as
-- search_console_queries' policies in phase 7: inspection verdicts are
-- read-only performance data any org member should see, not a credential.
create policy "org members can view url inspections"
  on url_inspections for select
  using (is_org_member_for_site(site_connection_id));

create policy "org admins can insert url inspections"
  on url_inspections for insert
  with check (is_org_admin_for_site(site_connection_id));

create policy "org admins can update url inspections"
  on url_inspections for update
  using (is_org_admin_for_site(site_connection_id))
  with check (is_org_admin_for_site(site_connection_id));

create policy "org admins can delete url inspections"
  on url_inspections for delete
  using (is_org_admin_for_site(site_connection_id));

-- Derived, human-actionable recommendations. Upserted by the natural key
-- (site_connection_id, recommendation_type, subject_key) rather than
-- replaced wholesale: a naive delete+insert would silently resurrect a
-- recommendation a human already dismissed on the very next sync.
--
-- subject_key is post_id::text for the post-scoped types, or the normalized
-- keyword for 'keyword_gap'. On regeneration the cron updates ONLY the
-- computed columns (title/description/priority/metrics/updated_at) and never
-- touches status/dismissed_at/actioned_at, so a human decision survives.
-- Rows whose underlying condition has resolved are deleted outright by the
-- cron (stale = noise, regardless of status).
create table content_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_connection_id uuid not null references site_connections(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  recommendation_type text not null check (recommendation_type in
    ('title_meta_rewrite','keyword_gap','indexing_problem','zero_traction')),
  subject_key text not null,
  title text not null,
  description text not null,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  metrics jsonb not null default '{}',
  status text not null default 'new' check (status in ('new','dismissed','actioned')),
  dismissed_at timestamptz,
  actioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_content_recommendations_natural_key
  on content_recommendations(site_connection_id, recommendation_type, subject_key);
create index idx_content_recommendations_org on content_recommendations(organization_id);
create index idx_content_recommendations_site on content_recommendations(site_connection_id);
create index idx_content_recommendations_status on content_recommendations(status);

alter table content_recommendations enable row level security;

-- Org-scoped (not site-scoped) helpers here because the table carries its
-- own organization_id, same as posts/audit_log. Both cron routes run under
-- @repo/database's service-role client, which bypasses RLS entirely — these
-- policies govern only the dashboard's session-scoped dismiss/mark-actioned
-- server actions.
create policy content_recommendations_select
  on content_recommendations for select
  using (is_org_member(organization_id));

create policy content_recommendations_insert
  on content_recommendations for insert
  with check (is_org_admin(organization_id));

create policy content_recommendations_update
  on content_recommendations for update
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

create policy content_recommendations_delete
  on content_recommendations for delete
  using (is_org_admin(organization_id));
